import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import {
  listCategories,
  getCategory,
  createCategory, createCategorySchema,
  updateCategory, updateCategorySchema,
  deleteCategory,
} from '../controllers/category.controller';

const router = Router();

router.get('/', listCategories);
router.get('/:id', getCategory);
router.post('/', authenticate, authorize('admin'), validate(createCategorySchema), createCategory);
router.patch('/:id', authenticate, authorize('admin'), validate(updateCategorySchema), updateCategory);
router.delete('/:id', authenticate, authorize('admin'), deleteCategory);

export default router;
