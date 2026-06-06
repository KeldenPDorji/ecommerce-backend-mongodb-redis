import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import {
  listProducts, listQuerySchema,
  getProduct,
  createProduct, createProductSchema,
  updateProduct, updateProductSchema,
  deleteProduct,
  getRecentlyViewed,
  getUniqueVisitorCount,
} from '../controllers/product.controller';

const router = Router();

router.get('/', validate(listQuerySchema, 'query'), listProducts);
router.get('/recently-viewed', authenticate, getRecentlyViewed);
router.get('/:id', getProduct);
router.get('/:id/unique-visitors', getUniqueVisitorCount);
router.post('/', authenticate, authorize('admin'), validate(createProductSchema), createProduct);
router.patch('/:id', authenticate, authorize('admin'), validate(updateProductSchema), updateProduct);
router.delete('/:id', authenticate, authorize('admin'), deleteProduct);

export default router;
