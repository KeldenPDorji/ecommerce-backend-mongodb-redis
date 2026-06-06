import { Request, Response } from 'express';
import { z } from 'zod';
import { Category } from '../models/Category';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { cache } from '../services/cache.service';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  parent: z.string().length(24).optional(),
  image: z.string().url().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const cacheKey = cache.categoryListKey();
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const categories = await Category.find({ isActive: true })
    .populate('parent', 'name slug')
    .sort({ name: 1 });

  const result = { success: true, data: categories };
  await cache.set(cacheKey, result, 600);
  res.json(result);
});

export const getCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const cacheKey = cache.categoryKey(id);
  const cached = await cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const category = await Category.findOne({ _id: id, isActive: true }).populate('parent', 'name slug');
  if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND');

  const result = { success: true, data: category };
  await cache.set(cacheKey, result, 600);
  res.json(result);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as z.infer<typeof createCategorySchema>;
  const category = await Category.create(data);
  await cache.del(cache.categoryListKey());
  res.status(201).json({ success: true, data: category });
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as z.infer<typeof updateCategorySchema>;

  const category = await Category.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND');

  await Promise.all([cache.del(cache.categoryKey(id)), cache.del(cache.categoryListKey())]);
  res.json({ success: true, data: category });
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND');

  await Promise.all([
    cache.del(cache.categoryKey(req.params.id)),
    cache.del(cache.categoryListKey()),
  ]);
  res.json({ success: true, message: 'Category removed' });
});
