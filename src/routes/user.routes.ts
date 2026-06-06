import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  getProfile,
  updateProfile, updateProfileSchema,
  addAddress, addressSchema,
  updateAddress,
  removeAddress,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from '../controllers/user.controller';

const router = Router();
router.use(authenticate);

router.get('/profile', getProfile);
router.patch('/profile', validate(updateProfileSchema), updateProfile);

router.get('/addresses', getProfile);
router.post('/addresses', validate(addressSchema), addAddress);
router.patch('/addresses/:addressId', validate(addressSchema.partial()), updateAddress);
router.delete('/addresses/:addressId', removeAddress);

router.get('/wishlist', getWishlist);
router.post('/wishlist/:productId', addToWishlist);
router.delete('/wishlist/:productId', removeFromWishlist);

export default router;
