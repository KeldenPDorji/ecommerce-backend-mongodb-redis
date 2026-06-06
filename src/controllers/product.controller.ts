import { Request, Response } from 'express';
import { z } from 'zod';
import { Product } from '../models/Product';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { cache } from '../services/cache.service';
import { redisService } from '../services/redis.service';
import { AuthRequest } from '../middleware/auth';

// ── Schemas ────────────────────────────────────────────────────────────────
export const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(10),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  sku: z.string().min(1).max(50),
  stock: z.number().int().min(0),
  category: z.string().length(24),
  images: z.array(z.string().url()).default([]),
  tags: z.array(z.string()).default([]),
  attributes: z.record(z.string()).default({}),
});

export const updateProductSchema = createProductSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'rating']).default('newest'),
});

// ── Controllers ────────────────────────────────────────────────────────────
export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listQuerySchema>;
  const cacheKey = cache.productListKey(JSON.stringify(query));

  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const { page, limit, search, category, minPrice, maxPrice, sort } = query;
  const filter: Record<string, unknown> = { isActive: true };

  if (search) filter.$text = { $search: search };
  if (category) filter.category = category;
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) (filter.price as Record<string, number>).$gte = minPrice;
    if (maxPrice !== undefined) (filter.price as Record<string, number>).$lte = maxPrice;
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    newest: { createdAt: -1 },
    rating: { averageRating: -1 },
  };

  const skip = (page - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sortMap[sort] ?? { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('category', 'name slug'),
    Product.countDocuments(filter),
  ]);

  const result = {
    success: true,
    data: products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };

  await cache.set(cacheKey, result, 300);
  res.json(result);
});

export const getProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const cacheKey = cache.productKey(id);

  const cached = await cache.get(cacheKey);
  if (cached) {
    // Still fire tracking for cache hits (fire-and-forget)
    const identifier = req.userId ?? (req.ip ?? 'anon');
    void Promise.all([
      redisService.incrementTrendingScore(id, 1),
      redisService.trackUniqueVisitor(id, identifier),
      req.userId ? redisService.addRecentlyViewed(req.userId, id) : Promise.resolve(),
    ]);
    res.json(cached);
    return;
  }

  const product = await Product.findOne({ _id: id, isActive: true }).populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

  // Fire Redis tracking (non-blocking)
  const identifier = req.userId ?? (req.ip ?? 'anon');
  void Promise.all([
    redisService.incrementTrendingScore(id, 1),
    redisService.trackUniqueVisitor(id, identifier),
    req.userId ? redisService.addRecentlyViewed(req.userId, id) : Promise.resolve(),
  ]);

  const result = { success: true, data: product };
  await cache.set(cacheKey, result, 600);
  res.json(result);
});

export const getRecentlyViewed = asyncHandler(async (req: AuthRequest, res: Response) => {
  const ids = await redisService.getRecentlyViewed(req.userId!);
  if (!ids.length) { res.json({ success: true, data: [] }); return; }

  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .select('name slug price images averageRating')
    .populate('category', 'name');

  // Preserve recency order from Redis list
  const map = new Map(products.map((p) => [String(p._id), p]));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);

  res.json({ success: true, data: ordered });
});

export const getUniqueVisitorCount = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const count = await redisService.countUniqueVisitors(id);
  res.json({ success: true, productId: id, uniqueVisitors: count });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as z.infer<typeof createProductSchema>;
  const product = await Product.create(data);
  await cache.delPattern('products:list:*');
  res.status(201).json({ success: true, data: product });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as z.infer<typeof updateProductSchema>;

  const product = await Product.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

  await Promise.all([
    cache.del(cache.productKey(id)),
    cache.delPattern('products:list:*'),
  ]);
  res.json({ success: true, data: product });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = await Product.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

  await Promise.all([
    cache.del(cache.productKey(id)),
    cache.delPattern('products:list:*'),
  ]);
  res.json({ success: true, message: 'Product removed' });
});
