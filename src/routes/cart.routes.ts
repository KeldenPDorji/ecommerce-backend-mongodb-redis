import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  getCart,
  addItem, addItemSchema,
  updateItem, updateItemSchema,
  clearCart,
  getGuestCart,
  addGuestItem,
  updateGuestItem,
  clearGuestCart,
} from '../controllers/cart.controller';

const router = Router();

// ── Guest cart (no auth required) ───────────────────────────────────────────
router.get('/guest', getGuestCart);
router.post('/guest/items', validate(addItemSchema), addGuestItem);
router.patch('/guest/items/:productId', validate(updateItemSchema), updateGuestItem);
router.delete('/guest', clearGuestCart);

// ── Authenticated cart ───────────────────────────────────────────────────────
router.use(authenticate);
router.get('/', getCart);
router.post('/items', validate(addItemSchema), addItem);
router.patch('/items/:productId', validate(updateItemSchema), updateItem);
router.delete('/', clearCart);

export default router;
