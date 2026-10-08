import mongoose from 'mongoose';

// Coaching report written offline (see scripts/analysis-*.js) and uploaded for one student.
const reportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    summary: String, // supports $LaTeX$ and **bold**, like questions
    basedOn: { attempts: Number, questions: Number, through: Date },
    weakTopics: [{ _id: false, subject: String, topic: String, severity: { type: String, enum: ['high', 'medium', 'low'] }, evidence: String, advice: String }],
    strengths: [{ _id: false, subject: String, topic: String, note: String }],
    habits: [{ _id: false, title: String, detail: String }], // time management, skipping, guessing…
    plan: [{ _id: false, step: String, task: String }],
    author: String,
  },
  { timestamps: true }
);

export default mongoose.models.AnalysisReport || mongoose.model('AnalysisReport', reportSchema);
