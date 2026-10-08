import Attempt from '../models/Attempt.js';
import Test from '../models/Test.js';
import '../models/Category.js'; // registers the model for populate() when run from scripts

// Load a user's submitted attempts together with their tests (one query per distinct test).
export async function loadSubmitted(userId) {
  const attempts = await Attempt.find({ user: userId, status: 'submitted' }).sort({ submittedAt: 1 }).lean();
  const testIds = [...new Set(attempts.map((a) => String(a.test)))];
  const tests = await Test.find({ _id: { $in: testIds } }).populate('category', 'name slug').lean();
  const byId = new Map(tests.map((t) => [String(t._id), t]));
  return attempts.filter((a) => byId.has(String(a.test))).map((attempt) => ({ attempt, test: byId.get(String(attempt.test)) }));
}
