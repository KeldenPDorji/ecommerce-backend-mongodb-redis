import { Response } from 'express';
import { z } from 'zod';
import { Review } from '../models/Review';
import { Order } from '../models/Order';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { cache } from '../services/cache.service';

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(2000),
});

export const listReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const skip = (page - 1) * limit;

  const cacheKey = cache.reviewListKey(`${productId}:${page}:${limit}`);
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const [reviews, total] = await Promise.all([
    Review.find({ product: productId })
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments({ product: productId }),
  ]);

  const result = {
    success: true,
    data: reviews,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  await cache.set(cacheKey, result, 120);
  res.json(result);
});

export const createReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  const { rating, title, body } = req.body as z.infer<typeof createReviewSchema>;

  const isVerifiedPurchase = (await Order.countDocuments({
    user: req.userId,
    'items.product': productId,
    status: 'delivered',
  })) > 0;

  const review = await Review.create({
    product: productId,
    user: req.userId,
    rating,
    title,
    body,
    isVerifiedPurchase,
  });

  await cache.delPattern(`reviews:product:${productId}*`);
  res.status(201).json({ success: true, data: review });
});

export const updateReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId, reviewId } = req.params;
  const data = req.body as z.infer<typeof createReviewSchema>;

  const review = await Review.findOneAndUpdate(
    { _id: reviewId, product: productId, user: req.userId },
    data,
    { new: true, runValidators: true }
  );
  if (!review) throw new AppError('Review not found or not yours', 404, 'NOT_FOUND');

  await cache.delPattern(`reviews:product:${productId}*`);
  res.json({ success: true, data: review });
});

export const deleteReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId, reviewId } = req.params;

  const filter =
    req.userRole === 'admin'
      ? { _id: reviewId, product: productId }
      : { _id: reviewId, product: productId, user: req.userId };

  const review = await Review.findOneAndDelete(filter);
  if (!review) throw new AppError('Review not found or not yours', 404, 'NOT_FOUND');

  await cache.delPattern(`reviews:product:${productId}*`);
  res.json({ success: true, message: 'Review deleted' });
});

export const markHelpful = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { reviewId } = req.params;
  const review = await Review.findByIdAndUpdate(
    reviewId,
    { $inc: { helpfulCount: 1 } },
    { new: true }
  );
  if (!review) throw new AppError('Review not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: review });
});
