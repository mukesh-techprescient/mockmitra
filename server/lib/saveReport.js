import User from '../models/User.js';
import AnalysisReport from '../models/AnalysisReport.js';
import { analysisFileSchema } from './analysisSchema.js';
import { formatZodError } from './testSchema.js';
import { ImportError } from './importTest.js';

export async function saveReport(json) {
  const parsed = analysisFileSchema.safeParse(json);
  if (!parsed.success) throw new ImportError('Invalid analysis JSON', formatZodError(parsed.error));
  const { userEmail, basedOn, kind, schemaVersion, ...rest } = parsed.data;
  const user = await User.findOne({ email: userEmail.toLowerCase() });
  if (!user) throw new ImportError(`No user with email ${userEmail}`);
  return AnalysisReport.create({
    ...rest,
    user: user._id,
    basedOn: basedOn && { ...basedOn, through: basedOn.through ? new Date(basedOn.through) : undefined },
  });
}
