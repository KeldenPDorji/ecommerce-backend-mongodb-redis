import { Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Cart } from '../models/Cart';
import { Product } from '../models/Product';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { redisService } from '../services/redis.service';

export const addItemSchema = z.object({
  productId: z.string().length(24),
  quantity: z.number().int().positive().default(1),
});

export const updateItemSchema = z.object({
  quantity: z.number().int().min(0),
});

const GUEST_COOKIE = 'guestId';
const GUEST_CART_TTL = 60 * 60 * 24; // 24 h

interface GuestCartItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
}

// ── Auth-based (MongoDB) cart helpers ────────────────────────────────────────
export const getCart = asyncHandler(async (req: AuthRequest, res: Response) => {
  const cart = await Cart.findOne({ user: req.userId }).populate(
    'items.product',
    'name images price stock isActive'
  );
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

// ── Guest cart (Redis String) ────────────────────────────────────────────────
function ensureGuestId(req: Request, res: Response): string {
  let guestId = req.cookies?.[GUEST_COOKIE] as string | undefined;
  if (!guestId) {
    guestId = uuidv4();
    res.cookie(GUEST_COOKIE, guestId, {
      httpOnly: true,
      maxAge: GUEST_CART_TTL * 1000,
      sameSite: 'lax',
    });
  }
  return guestId;
}

export const getGuestCart = asyncHandler(async (req: Request, res: Response) => {
  const guestId = req.cookies?.[GUEST_COOKIE] as string | undefined;
  if (!guestId) { res.json({ success: true, data: { items: [], totalPrice: 0 } }); return; }

  const cart = (await redisService.getGuestCart(guestId)) as { items: GuestCartItem[] } | null;
  const items = cart?.items ?? [];
  const totalPrice = items.reduce((s, i) => s + i.price * i.quantity, 0);
  res.json({ success: true, data: { items, totalPrice } });
});

export const addGuestItem = asyncHandler(async (req: Request, res: Response) => {
  const { productId, quantity } = req.body as z.infer<typeof addItemSchema>;

  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
  if (product.stock < quantity) {
    throw new AppError(`Only ${product.stock} unit(s) available`, 400, 'INSUFFICIENT_STOCK');
  }

  const guestId = ensureGuestId(req, res);
  const existing = (await redisService.getGuestCart(guestId)) as { items: GuestCartItem[] } | null;
  const items: GuestCartItem[] = existing?.items ?? [];

  const idx = items.findIndex((i) => i.productId === productId);
  if (idx >= 0) {
    const newQty = items[idx].quantity + quantity;
    if (newQty > product.stock) {
      throw new AppError(`Only ${product.stock} unit(s) available`, 400, 'INSUFFICIENT_STOCK');
    }
    items[idx].quantity = newQty;
  } else {
    items.push({
      productId,
      name: product.name,
      image: product.images[0] ?? '',
      price: product.price,
      quantity,
    });
  }

  await redisService.setGuestCart(guestId, { items }, GUEST_CART_TTL);
  const totalPrice = items.reduce((s, i) => s + i.price * i.quantity, 0);
  res.json({ success: true, data: { items, totalPrice } });
});

export const updateGuestItem = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { quantity } = req.body as z.infer<typeof updateItemSchema>;
  const guestId = req.cookies?.[GUEST_COOKIE] as string | undefined;
  if (!guestId) throw new AppError('No guest cart', 404, 'NOT_FOUND');

  const existing = (await redisService.getGuestCart(guestId)) as { items: GuestCartItem[] } | null;
  let items: GuestCartItem[] = existing?.items ?? [];

  if (quantity === 0) {
    items = items.filter((i) => i.productId !== productId);
  } else {
    const item = items.find((i) => i.productId === productId);
    if (!item) throw new AppError('Item not in cart', 404, 'NOT_FOUND');
    item.quantity = quantity;
  }

  await redisService.setGuestCart(guestId, { items }, GUEST_CART_TTL);
  const totalPrice = items.reduce((s, i) => s + i.price * i.quantity, 0);
  res.json({ success: true, data: { items, totalPrice } });
});

export const clearGuestCart = asyncHandler(async (req: Request, res: Response) => {
  const guestId = req.cookies?.[GUEST_COOKIE] as string | undefined;
  if (guestId) await redisService.deleteGuestCart(guestId);
  res.clearCookie(GUEST_COOKIE);
  res.json({ success: true, message: 'Guest cart cleared' });
});
