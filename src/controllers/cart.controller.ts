import { Response } from 'express';
import { z } from 'zod';
import { Cart } from '../models/Cart';
import { Product } from '../models/Product';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';

export const addItemSchema = z.object({
  productId: z.string().length(24),
  quantity: z.number().int().positive().default(1),
});

export const updateItemSchema = z.object({
  quantity: z.number().int().min(0),
});

export const getCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const cart = await Cart.findOne({ user: req.userId }).populate('items.product', 'name images price stock isActive');
  res.json({ success: true, data: cart ?? { items: [], totalPrice: 0 } });
});

export const addItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId, quantity } = req.body as z.infer<typeof addItemSchema>;

  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
  if (product.stock < quantity) {
    throw new AppError(`Only ${product.stock} unit(s) available`, 400, 'INSUFFICIENT_STOCK');
  }

  let cart = await Cart.findOne({ user: req.userId });
  if (!cart) cart = new Cart({ user: req.userId, items: [] });

  const existing = cart.items.find((i) => String(i.product) === productId);
  if (existing) {
    const newQty = existing.quantity + quantity;
    if (newQty > product.stock) {
      throw new AppError(`Only ${product.stock} unit(s) available`, 400, 'INSUFFICIENT_STOCK');
    }
    existing.quantity = newQty;
  } else {
    cart.items.push({
      product: product._id,
      name: product.name,
      image: product.images[0] ?? '',
      price: product.price,
      quantity,
    });
  }

  await cart.save();
  res.json({ success: true, data: cart });
});

export const updateItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  const { quantity } = req.body as z.infer<typeof updateItemSchema>;

  const cart = await Cart.findOne({ user: req.userId });
  if (!cart) throw new AppError('Cart not found', 404, 'NOT_FOUND');

  if (quantity === 0) {
    cart.items = cart.items.filter((i) => String(i.product) !== productId);
  } else {
    const item = cart.items.find((i) => String(i.product) === productId);
    if (!item) throw new AppError('Item not in cart', 404, 'NOT_FOUND');

    const product = await Product.findById(productId);
    if (product && quantity > product.stock) {
      throw new AppError(`Only ${product.stock} unit(s) available`, 400, 'INSUFFICIENT_STOCK');
    }
    item.quantity = quantity;
  }

  await cart.save();
  res.json({ success: true, data: cart });
});

export const clearCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  await Cart.findOneAndUpdate({ user: req.userId }, { items: [], totalPrice: 0 });
  res.json({ success: true, message: 'Cart cleared' });
});
