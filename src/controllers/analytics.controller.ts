import { Request, Response } from 'express';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { Inventory } from '../models/Inventory';
import { asyncHandler } from '../utils/asyncHandler';
import { cache } from '../services/cache.service';
import { redisService } from '../services/redis.service';

// ── Aggregation Pipeline 1: Monthly Revenue ──────────────────────────────────
export const getMonthlySales = asyncHandler(async (_req: Request, res: Response) => {
  const cacheKey = cache.analyticsKey('monthly-sales');
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const data = await Order.aggregate([
    { $match: { status: { $in: ['delivered', 'shipped', 'confirmed', 'processing'] } } },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: { $sum: '$totalPrice' },
        orders: { $sum: 1 },
        avgOrderValue: { $avg: '$totalPrice' },
      },
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } },
    { $limit: 12 },
    {
      $project: {
        _id: 0,
        year: '$_id.year',
        month: '$_id.month',
        revenue: { $round: ['$revenue', 2] },
        orders: 1,
        avgOrderValue: { $round: ['$avgOrderValue', 2] },
      },
    },
  ]);

  const result = { success: true, data };
  await cache.set(cacheKey, result, 3600); // 1-hour cache for analytics
  res.json(result);
});

// ── Aggregation Pipeline 2: Daily Sales (last 30 days) ───────────────────────
export const getDailySales = asyncHandler(async (_req: Request, res: Response) => {
  const cacheKey = cache.analyticsKey('daily-sales');
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const data = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        status: { $nin: ['cancelled', 'refunded'] },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
        revenue: { $sum: '$totalPrice' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    {
      $project: {
        _id: 0,
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day',
          },
        },
        revenue: { $round: ['$revenue', 2] },
        orders: 1,
      },
    },
  ]);

  const result = { success: true, data };
  await cache.set(cacheKey, result, 1800);
  res.json(result);
});

// ── Low-Stock Alert Report ───────────────────────────────────────────────────
export const getLowStockProducts = asyncHandler(async (req: Request, res: Response) => {
  const threshold = Number(req.query.threshold) || 10;
  const cacheKey = cache.analyticsKey(`low-stock:${threshold}`);
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const products = await Product.find({ stock: { $lte: threshold }, isActive: true })
    .select('name sku stock category')
    .populate('category', 'name')
    .sort({ stock: 1 });

  const result = { success: true, count: products.length, data: products };
  await cache.set(cacheKey, result, 300);
  res.json(result);
});

// ── Aggregation Pipeline 3: Top Products by Revenue ─────────────────────────
export const getTopProducts = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const cacheKey = cache.analyticsKey(`top-products:${limit}`);
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const data = await Order.aggregate([
    { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        totalSold: { $sum: '$items.quantity' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: 1,
        totalRevenue: { $round: ['$totalRevenue', 2] },
        totalSold: 1,
        orderCount: 1,
      },
    },
  ]);

  const result = { success: true, data };
  await cache.set(cacheKey, result, 3600);
  res.json(result);
});

// ── Trending Products (Redis Sorted Set) ────────────────────────────────────
export const getTrendingProducts = asyncHandler(async (_req: Request, res: Response) => {
  const trending = await redisService.getTrending(10);

  if (!trending.length) {
    res.json({ success: true, data: [] });
    return;
  }

  const ids = trending.map((t) => t.productId);
  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .select('name slug price images averageRating numReviews')
    .populate('category', 'name');

  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const data = trending
    .map((t) => ({ ...productMap.get(t.productId)?.toObject(), _score: t.score }))
    .filter((p) => p._id);

  res.json({ success: true, data });
});

// ── Top Buyers Leaderboard (Redis Sorted Set) ────────────────────────────────
export const getTopBuyers = asyncHandler(async (req: Request, res: Response) => {
  const month = (req.query.month as string) || undefined;
  const buyers = await redisService.getTopBuyers(10, month);

  res.json({ success: true, data: buyers });
});

// ── Inventory History ────────────────────────────────────────────────────────
export const getInventoryHistory = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    Inventory.find({ product: productId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Inventory.countDocuments({ product: productId }),
  ]);

  res.json({
    success: true,
    data: events,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});
