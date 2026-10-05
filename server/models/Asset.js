import mongoose from 'mongoose';

// Figures extracted from papers. Small PNG/JPEG blobs, served via /api/assets/:id.
const assetSchema = new mongoose.Schema(
  {
    contentType: String,
    data: Buffer,
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', index: true },
  },
  { timestamps: true }
);

export default mongoose.models.Asset || mongoose.model('Asset', assetSchema);
