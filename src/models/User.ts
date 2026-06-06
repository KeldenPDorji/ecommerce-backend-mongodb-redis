import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAddress {
  label: string;
  fullName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

export interface IPaymentPreferences {
  defaultMethod: 'stripe' | 'paypal' | 'cod';
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'customer' | 'seller' | 'admin';
  isEmailVerified: boolean;
  refreshTokens: string[];
  addresses: IAddress[];
  paymentPreferences: IPaymentPreferences;
  wishlist: mongoose.Types.ObjectId[];
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const addressSchema = new Schema<IAddress>(
  {
    label: { type: String, default: 'Home' },
    fullName: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['customer', 'seller', 'admin'], default: 'customer' },
    isEmailVerified: { type: Boolean, default: false },
    refreshTokens: { type: [String], default: [], select: false },
    addresses: { type: [addressSchema], default: [] },
    paymentPreferences: {
      defaultMethod: { type: String, enum: ['stripe', 'paypal', 'cod'], default: 'cod' },
    },
    wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r['password'];
    delete r['refreshTokens'];
    delete r['__v'];
    return r;
  },
});

export const User = mongoose.model<IUser>('User', userSchema);
