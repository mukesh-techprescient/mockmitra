import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  { key: String, text: String, image: String },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    qid: { type: String, required: true },   // stable id from the JSON, e.g. "q1"
    number: Number,
    section: String,                         // section id
    topic: String,
    difficulty: String,
    text: String,                            // markdown-ish text with $LaTeX$
    image: String,                           // URL (/api/assets/:id) or null
    options: [optionSchema],
    answer: String,                          // option key
    explanation: String,                     // with $LaTeX$
    explanationImage: String,
  },
  { _id: false }
);

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    year: Number,
    description: String,
    durationMinutes: { type: Number, required: true },
    marking: {
      correct: { type: Number, default: 1 },
      incorrect: { type: Number, default: 0 },
      unattempted: { type: Number, default: 0 },
    },
    instructions: [String],
    sections: [{ _id: false, id: String, name: String }],
    questions: [questionSchema],
    questionCount: Number,
    published: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

testSchema.pre('save', function (next) {
  this.questionCount = this.questions.length;
  next();
});

export default mongoose.models.Test || mongoose.model('Test', testSchema);
