import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  getCart,
  addItem, addItemSchema,
  updateItem, updateItemSchema,
  clearCart,
} from '../controllers/cart.controller';

const router = Router();
router.use(authenticate);

router.get('/', getCart);
router.post('/items', validate(addItemSchema), addItem);
router.patch('/items/:productId', validate(updateItemSchema), updateItem);
router.delete('/', clearCart);

export default router;
