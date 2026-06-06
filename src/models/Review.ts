import mongoose, { Document, Schema } from 'mongoose';
import { Product } from './Product';

export interface IReview extends Document {
  product: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    isVerifiedPurchase: { type: Boolean, default: false },
    helpfulCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// One review per user per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
// Fast listing by product sorted by rating
reviewSchema.index({ product: 1, rating: -1 });
// Recent reviews across the platform
reviewSchema.index({ createdAt: -1 });

// Recompute product averageRating after each save/delete
async function syncProductRating(productId: mongoose.Types.ObjectId): Promise<void> {
  const stats = await Review.aggregate([
    { $match: { product: productId } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] ?? {};
  await Product.findByIdAndUpdate(productId, {
    averageRating: Math.round(avg * 10) / 10,
    numReviews: count,
  });
}

reviewSchema.post('save', async function () {
  await syncProductRating(this.product);
});

reviewSchema.post('findOneAndDelete', async function (doc: IReview | null) {
  if (doc) await syncProductRating(doc.product);
});

export const Review = mongoose.model<IReview>('Review', reviewSchema);
