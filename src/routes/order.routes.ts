import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  placeOrder, placeOrderSchema,
  getMyOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus, updateStatusSchema,
} from '../controllers/order.controller';

const router = Router();
router.use(authenticate);

router.post('/', validate(placeOrderSchema), placeOrder);
router.get('/my', getMyOrders);
router.get('/:id', getOrderById);
router.patch('/:id/cancel', cancelOrder);

// Admin only
router.patch('/:id/status', authorize('admin'), validate(updateStatusSchema), updateOrderStatus);

export default router;
