import mongoose from 'mongoose';
import Test from '../models/Test.js';
import Asset from '../models/Asset.js';
import Category from '../models/Category.js';
import { testFileSchema, formatZodError } from './testSchema.js';

export class ImportError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

export function validateTestFile(json) {
  const parsed = testFileSchema.safeParse(json);
  if (!parsed.success) throw new ImportError('Invalid test JSON', formatZodError(parsed.error));
  return parsed.data;
}

// Validates, stores embedded images as Assets, and creates (or replaces) a Test.
export async function importTest(json, { userId, replaceTestId, createCategory = true } = {}) {
  const data = validateTestFile(json);

  let category = await Category.findOne({ slug: data.category });
  if (!category) {
    if (!createCategory) throw new ImportError(`Category "${data.category}" does not exist`);
    category = await Category.create({ name: data.category.toUpperCase(), slug: data.category });
  }

  const testId = replaceTestId ? new mongoose.Types.ObjectId(replaceTestId) : new mongoose.Types.ObjectId();

  async function storeImage(src) {
    if (!src) return null;
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(src);
    if (!m) return src; // already a URL
    const asset = await Asset.create({ contentType: m[1], data: Buffer.from(m[2], 'base64'), test: testId });
    return `/api/assets/${asset._id}`;
  }

  if (replaceTestId) await Asset.deleteMany({ test: testId });

  const questions = [];
  for (const q of data.questions) {
    questions.push({
      qid: q.id,
      number: q.number,
      section: q.section,
      topic: q.topic,
      difficulty: q.difficulty,
      text: q.text,
      image: await storeImage(q.image),
      options: await Promise.all(q.options.map(async (o) => ({ key: o.key, text: o.text, image: await storeImage(o.image) }))),
      answer: q.answer,
      explanation: q.explanation,
      explanationImage: await storeImage(q.explanationImage),
    });
  }

  const doc = {
    title: data.title,
    category: category._id,
    year: data.year,
    description: data.description,
    durationMinutes: data.durationMinutes,
    marking: data.marking,
    instructions: data.instructions,
    sections: data.sections,
    questions,
    questionCount: questions.length,
    createdBy: userId,
  };

  if (replaceTestId) {
    const existing = await Test.findById(testId);
    if (!existing) throw new ImportError('Test to replace not found');
    existing.set(doc);
    return existing.save();
  }
  return Test.create({ _id: testId, ...doc });
}
