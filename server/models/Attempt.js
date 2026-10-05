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
    deadline: Date, // pushed back on resume by the time spent paused
    pausedAt: { type: Date, default: null }, // set while paused; the clock is stopped
    pausedMs: { type: Number, default: 0 }, // total time spent paused
    lastQid: String, // question on screen when paused, to resume there
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
// At most one open attempt per user per test (guards against double "start" requests).
attemptSchema.index({ user: 1, test: 1 }, { unique: true, partialFilterExpression: { status: 'in_progress' } });

export default mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);
