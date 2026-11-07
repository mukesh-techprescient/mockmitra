import mongoose from 'mongoose';

// A student's Q&A thread with the AI coach: one about all their tests (attempt = null)
// and one per paper. "New conversation" clears the messages.
const chatSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', default: null },
    messages: [{
      _id: false,
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
      at: { type: Date, default: Date.now },
    }],
    askedAt: [Date], // when each question was asked; kept when the conversation is cleared, for the daily limit
  },
  { timestamps: true }
);
chatSchema.index({ user: 1, attempt: 1 }, { unique: true });

export default mongoose.models.CoachChat || mongoose.model('CoachChat', chatSchema);
