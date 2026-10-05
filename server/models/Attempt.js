import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    qid: String,
    selected: { type: String, default: null }, // option key or null
    flagged: { type: Boolean, default: false }, // "mark for review"
    timeSpentSec: { type: Number, default: 0 },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    status: { type: String, enum: ['in_progress', 'submitted'], default: 'in_progress' },
    startedAt: { type: Date, default: Date.now },
    deadline: Date,
    submittedAt: Date,
    answers: [answerSchema],
    result: {
      score: Number,
      maxScore: Number,
      correct: Number,
      incorrect: Number,
      unattempted: Number,
      timeTakenSec: Number,
      sections: [
        { _id: false, id: String, name: String, score: Number, maxScore: Number, correct: Number, incorrect: Number, unattempted: Number },
      ],
    },
  },
  { timestamps: true }
);

attemptSchema.index({ user: 1, test: 1, status: 1 });

export default mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);
