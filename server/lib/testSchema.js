import { z } from 'zod';

// The JSON contract for an uploaded paper. Produced offline by tools/pdf2json
// (or by hand) and uploaded through the admin UI. See DESIGN.md.
// Images may be a URL or a data: URI; data URIs are moved into the Asset
// collection on import.

const image = z.string().nullable().optional();

export const optionSchema = z.object({
  key: z.string().min(1),          // "a" | "b" | "c" | "d"
  text: z.string().default(''),
  image,
});

export const questionSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().optional(),
  section: z.string().min(1),
  topic: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  text: z.string().min(1),
  image,
  options: z.array(optionSchema).min(2),
  answer: z.string().min(1),
  explanation: z.string().default(''),
  explanationImage: image,
});

export const testFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1),
    category: z.string().min(1),   // category slug, e.g. "mht-cet"
    year: z.number().int().optional(),
    description: z.string().optional(),
    durationMinutes: z.number().positive(),
    marking: z
      .object({
        correct: z.number().default(1),
        incorrect: z.number().default(0),
        unattempted: z.number().default(0),
      })
      .default({}),
    instructions: z.array(z.string()).default([]),
    sections: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((t, ctx) => {
    const sectionIds = new Set(t.sections.map((s) => s.id));
    const seen = new Set();
    t.questions.forEach((q, i) => {
      if (seen.has(q.id)) ctx.addIssue({ code: 'custom', path: ['questions', i, 'id'], message: `duplicate id ${q.id}` });
      seen.add(q.id);
      if (!sectionIds.has(q.section))
        ctx.addIssue({ code: 'custom', path: ['questions', i, 'section'], message: `unknown section "${q.section}"` });
      if (!q.options.some((o) => o.key === q.answer))
        ctx.addIssue({ code: 'custom', path: ['questions', i, 'answer'], message: `answer "${q.answer}" is not an option key` });
    });
  });

export function formatZodError(err) {
  return err.issues.slice(0, 50).map((i) => `${i.path.join('.')}: ${i.message}`);
}
