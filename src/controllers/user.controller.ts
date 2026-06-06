import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Product } from '../models/Product';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  paymentPreferences: z
    .object({ defaultMethod: z.enum(['stripe', 'paypal', 'cod']) })
    .optional(),
});

export const addressSchema = z.object({
  label: z.string().default('Home'),
  fullName: z.string().min(2),
  address: z.string().min(5),
  city: z.string().min(2),
  postalCode: z.string().min(3),
  country: z.string().min(2),
  phone: z.string().min(7),
  isDefault: z.boolean().default(false),
});

// ── Profile ──────────────────────────────────────────────────────────────────
export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId).populate('wishlist', 'name slug price images');
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: user });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = req.body as z.infer<typeof updateProfileSchema>;
  const user = await User.findByIdAndUpdate(req.userId, data, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: user });
});

// ── Addresses ────────────────────────────────────────────────────────────────
export const addAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const addr = req.body as z.infer<typeof addressSchema>;
  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  if (addr.isDefault) {
    user.addresses.forEach((a) => { a.isDefault = false; });
  }
  user.addresses.push(addr);
  await user.save();
  res.status(201).json({ success: true, data: user.addresses });
});

export const updateAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { addressId } = req.params;
  const update = req.body as Partial<z.infer<typeof addressSchema>>;

  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const addr = user.addresses.find((a) => String((a as unknown as { _id: mongoose.Types.ObjectId })._id) === addressId);
  if (!addr) throw new AppError('Address not found', 404, 'NOT_FOUND');

  if (update.isDefault) {
    user.addresses.forEach((a) => { a.isDefault = false; });
  }
  Object.assign(addr, update);
  await user.save();
  res.json({ success: true, data: user.addresses });
});

export const removeAddress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { addressId } = req.params;
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $pull: { addresses: { _id: new mongoose.Types.ObjectId(addressId) } } },
    { new: true }
  );
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: user.addresses });
});

// ── Wishlist ─────────────────────────────────────────────────────────────────
export const getWishlist = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId).populate(
    'wishlist',
    'name slug price compareAtPrice images averageRating isActive'
  );
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: user.wishlist });
});

export const addToWishlist = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

  await User.findByIdAndUpdate(req.userId, {
    $addToSet: { wishlist: new mongoose.Types.ObjectId(productId) },
  });
  res.json({ success: true, message: 'Added to wishlist' });
});

export const removeFromWishlist = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  await User.findByIdAndUpdate(req.userId, {
    $pull: { wishlist: new mongoose.Types.ObjectId(productId) },
  });
  res.json({ success: true, message: 'Removed from wishlist' });
});
