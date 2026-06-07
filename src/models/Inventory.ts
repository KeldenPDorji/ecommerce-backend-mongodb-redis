import mongoose, { Document, Schema } from 'mongoose';

export type InventoryReason = 'sale' | 'restock' | 'adjustment' | 'return' | 'damage';

export interface IInventory extends Document {
  product: mongoose.Types.ObjectId;
  sku: string;
  delta: number;
  reason: InventoryReason;
  reference?: mongoose.Types.ObjectId;
  stockAfter: number;
  note?: string;
  createdAt: Date;
}

const inventorySchema = new Schema<IInventory>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, default: '', uppercase: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ['sale', 'restock', 'adjustment', 'return', 'damage'],
      required: true,
    },
    reference: { type: Schema.Types.ObjectId, ref: 'Order' },
    stockAfter: { type: Number, required: true, min: 0 },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Fast look-up by product for stock history
inventorySchema.index({ product: 1, createdAt: -1 });
// Quick SKU-based queries
inventorySchema.index({ sku: 1, createdAt: -1 });

export const Inventory = mongoose.model<IInventory>('Inventory', inventorySchema);
