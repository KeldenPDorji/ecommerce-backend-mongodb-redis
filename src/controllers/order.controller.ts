import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Order, OrderStatus } from '../models/Order';
import { Cart } from '../models/Cart';
import { Product } from '../models/Product';
import { Inventory } from '../models/Inventory';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { sendOrderConfirmation } from '../services/email.service';
import { User } from '../models/User';
import { redisService } from '../services/redis.service';

export const placeOrderSchema = z.object({
  shippingAddress: z.object({
    fullName: z.string().min(2),
    address: z.string().min(5),
    city: z.string().min(2),
    postalCode: z.string().min(3),
    country: z.string().min(2),
    phone: z.string().min(7),
  }),
  paymentMethod: z.enum(['stripe', 'paypal', 'cod']),
});

export const updateStatusSchema = z.object({
  status: z.enum(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
  trackingNumber: z.string().optional(),
});

const TAX_RATE = 0.08;
const SHIPPING_THRESHOLD = 50;
const SHIPPING_FEE = 5.99;

export const placeOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { shippingAddress, paymentMethod } = req.body as z.infer<typeof placeOrderSchema>;

  const cart = await Cart.findOne({ user: req.userId });
  if (!cart || cart.items.length === 0) {
    throw new AppError('Cart is empty', 400, 'EMPTY_CART');
  }

  // Validate stock and lock prices in a session for atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderItems = [];
    let itemsPrice = 0;

    for (const cartItem of cart.items) {
      const product = await Product.findOneAndUpdate(
        { _id: cartItem.product, stock: { $gte: cartItem.quantity }, isActive: true },
        { $inc: { stock: -cartItem.quantity } },
        { new: true, session }
      );

      if (!product) {
        throw new AppError(
          `"${cartItem.name}" is out of stock or unavailable`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images[0] ?? '',
        price: product.price,
        quantity: cartItem.quantity,
      });
      itemsPrice += product.price * cartItem.quantity;
    }

    const shippingPrice = itemsPrice >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const taxPrice = parseFloat((itemsPrice * TAX_RATE).toFixed(2));
    const totalPrice = parseFloat((itemsPrice + shippingPrice + taxPrice).toFixed(2));

    const [order] = await Order.create(
      [
        {
          user: req.userId,
          items: orderItems,
          shippingAddress,
          itemsPrice,
          shippingPrice,
          taxPrice,
          totalPrice,
          paymentMethod,
        },
      ],
      { session }
    );

    // Clear the cart
    await Cart.findOneAndUpdate({ user: req.userId }, { items: [], totalPrice: 0 }, { session });

    await session.commitTransaction();

    // Post-commit: write inventory events + update Redis leaderboard (fire-and-forget)
    const inventoryEvents = orderItems.map((item) => ({
      product: item.product,
      sku: '',
      delta: -item.quantity,
      reason: 'sale' as const,
      reference: order._id,
      stockAfter: 0,
    }));
    void Inventory.insertMany(inventoryEvents).catch(() => null);
    void redisService.recordPurchase(String(req.userId), totalPrice).catch(() => null);
    // Boost trending score on purchase (weighted 5× vs a view)
    void Promise.all(
      orderItems.map((item) =>
        redisService.incrementTrendingScore(String(item.product), 5).catch(() => null)
      )
    );

    const user = await User.findById(req.userId).select('email');
    if (user) await sendOrderConfirmation(user.email, String(order._id));

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

export const getMyOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find({ user: req.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments({ user: req.userId }),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getOrderById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.userId });
  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: order });
});

export const updateOrderStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, trackingNumber } = req.body as z.infer<typeof updateStatusSchema>;

  const update: Partial<{ status: OrderStatus; trackingNumber: string; isDelivered: boolean; deliveredAt: Date }> = {
    status,
  };
  if (trackingNumber) update.trackingNumber = trackingNumber;
  if (status === 'delivered') {
    update.isDelivered = true;
    update.deliveredAt = new Date();
  }

  const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: order });
});

export const cancelOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.userId });
  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');

  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new AppError('Order cannot be cancelled at this stage', 400, 'INVALID_STATE');
  }

  // Restore stock
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity } },
        { session }
      );
    }
    await Order.findByIdAndUpdate(order._id, { status: 'cancelled' }, { session });
    await session.commitTransaction();

    // Log inventory restoration
    void Inventory.insertMany(
      order.items.map((item) => ({
        product: item.product,
        sku: '',
        delta: item.quantity,
        reason: 'return' as const,
        reference: order._id,
        stockAfter: 0,
      }))
    ).catch(() => null);

    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
