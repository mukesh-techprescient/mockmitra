import mongoose from 'mongoose';

// A student's mistake notebook. Items point at a question inside a Test (test + qid) and keep
// the student's own answer from the attempt they saved it from, their note, and review progress.
const itemSchema = new mongoose.Schema(
  {
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    qid: { type: String, required: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt' },
    yourAnswer: { type: String, default: null }, // option chosen when it was saved (null = skipped)
    note: { type: String, default: '', maxlength: 2000 },
    mastered: { type: Boolean, default: false },
    reviews: { type: Number, default: 0 },
    lastResult: { type: String, enum: ['correct', 'incorrect', null], default: null },
    lastReviewedAt: Date,
    addedAt: { type: Date, default: Date.now },
  }
);

const notebookSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 500 },
    items: [itemSchema],
  },
  { timestamps: true }
);

export default mongoose.models.Notebook || mongoose.model('Notebook', notebookSchema);
