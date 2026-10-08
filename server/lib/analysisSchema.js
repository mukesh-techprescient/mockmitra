import { z } from 'zod';

// JSON contract for an offline coaching report (uploaded via admin UI or `npm run analysis:upload`).
export const analysisFileSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('analysis'),
  userEmail: z.string().email(),
  title: z.string().min(1).max(200),
  summary: z.string().max(20000).default(''),
  basedOn: z.object({ attempts: z.number().int(), questions: z.number().int(), through: z.string() }).partial().optional(),
  weakTopics: z.array(z.object({
    subject: z.string().default(''),
    topic: z.string().min(1),
    severity: z.enum(['high', 'medium', 'low']),
    evidence: z.string().default(''),
    advice: z.string().default(''),
  })).default([]),
  strengths: z.array(z.object({ subject: z.string().default(''), topic: z.string().min(1), note: z.string().default('') })).default([]),
  habits: z.array(z.object({ title: z.string().min(1), detail: z.string().default('') })).default([]),
  plan: z.array(z.object({ step: z.string().min(1), task: z.string().min(1) })).default([]),
  author: z.string().default('MockMitra coach'),
});
