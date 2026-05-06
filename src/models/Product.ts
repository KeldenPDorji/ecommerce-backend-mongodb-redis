import mongoose, { Document, Schema } from 'mongoose';
import slugify from 'slugify';

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  stock: number;
  category: mongoose.Types.ObjectId;
  images: string[];
  tags: string[];
  attributes: Record<string, string>;
  isActive: boolean;
  averageRating: number;
  numReviews: number;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, unique: true, lowercase: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    sku: { type: String, required: true, unique: true, uppercase: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    images: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    attributes: { type: Map, of: String, default: {} },
    isActive: { type: Boolean, default: true },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Text search index
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });

productSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

export const Product = mongoose.model<IProduct>('Product', productSchema);
