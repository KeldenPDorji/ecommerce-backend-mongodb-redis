import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import {
  listReviews,
  createReview, createReviewSchema,
  updateReview,
  deleteReview,
  markHelpful,
} from '../controllers/review.controller';

// Mounted at /api/v1/products/:productId/reviews
const router = Router({ mergeParams: true });

router.get('/', listReviews);
router.post('/', authenticate, validate(createReviewSchema), createReview);
router.patch('/:reviewId', authenticate, validate(createReviewSchema.partial()), updateReview);
router.delete('/:reviewId', authenticate, deleteReview);
router.post('/:reviewId/helpful', authenticate, markHelpful);

export default router;
