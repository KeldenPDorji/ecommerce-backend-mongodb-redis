import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getMonthlySales,
  getDailySales,
  getLowStockProducts,
  getTopProducts,
  getTrendingProducts,
  getTopBuyers,
  getInventoryHistory,
} from '../controllers/analytics.controller';

const router = Router();

// Public: trending products visible to all
router.get('/trending', getTrendingProducts);

// Admin-only analytics
router.use(authenticate, authorize('admin'));
router.get('/sales/monthly', getMonthlySales);
router.get('/sales/daily', getDailySales);
router.get('/products/low-stock', getLowStockProducts);
router.get('/products/top', getTopProducts);
router.get('/leaderboard/buyers', getTopBuyers);
router.get('/inventory/:productId', getInventoryHistory);

export default router;
