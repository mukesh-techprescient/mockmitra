import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },        // "MHT-CET"
    slug: { type: String, required: true, unique: true },       // "mht-cet"
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Category || mongoose.model('Category', categorySchema);
