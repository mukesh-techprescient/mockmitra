// AI coach: coach reports (all papers, or one paper) and Q&A, generated with the Claude API.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import User from '../models/User.js';
import AnalysisReport from '../models/AnalysisReport.js';
import { loadSubmitted } from './performance.js';
import { overallContext, attemptContext } from './coachContext.js';

export const MODEL = () => process.env.CLAUDE_MODEL || 'claude-opus-5-5';
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

let client;
const claude = () => (client ??= new Anthropic({ maxRetries: 2 }));

// Server-side fallback: if the model declines (a safety-classifier false positive), the API retries
// the same request on a fallback model it picks, inside the same call.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

const FORMAT_RULES = `Formatting (the app renders only these): plain text with line breaks; **bold** for emphasis; ` +
  `maths in $...$ (inline) or $$...$$ (display) LaTeX. Never use a single * or _ for italics, markdown headings (#), ` +
  `tables or code blocks. For a list, start lines with "- " or "1. ".`;

const COACH = `You are the MockMitra exam coach. MockMitra is a practice platform for Indian entrance exams ` +
  `(BITSAT, MHT-CET, JEE, NEET and similar). You coach one student using their real mock-test data, given below.
How to coach:
- Ground every claim in the data: name topics, paper titles, question numbers and counts. Never invent results.
- Refer to papers by their titles exactly as given (for example "BITSAT Mock Test 2" or "FT4"); do not make up abbreviations.
- Separate knowledge gaps (wrong answers) from exam technique (skipping, time spent, rushing, guessing under negative marking).
- With small samples (insufficient or just a few questions), say the evidence is thin instead of over-claiming.
- Be specific and practical: what to revise, how many questions to practise, how to use the time in the exam.
- Speak to the student directly ("you"), warmly but honestly, in clear simple English.
- A section the student skipped entirely in a paper means they chose not to take it, not that they are weak at it.
${FORMAT_RULES}`;

// ---------- reports ----------

const ReportSchema = z.object({
  title: z.string().describe('One-line headline of the main finding, under 90 characters'),
  summary: z.string().describe('3-6 sentences: where the student stands, what changed, and the single most important next step'),
  weakTopics: z.array(z.object({
    subject: z.string(),
    topic: z.string().describe('Topic or skill to work on'),
    severity: z.string().describe('high, medium or low'),
    evidence: z.string().describe('The numbers behind it: counts, question numbers, papers'),
    advice: z.string().describe('Concrete action: what to revise and practise, and how much'),
  })).describe('2-6 focus areas, most important first'),
  habits: z.array(z.object({ title: z.string(), detail: z.string() })).describe('Exam-technique observations: time, skipping, accuracy under negative marking. 1-4 items'),
  strengths: z.array(z.object({ subject: z.string(), topic: z.string(), note: z.string() })).describe('1-4 things that are going well'),
  plan: z.array(z.object({ step: z.string().describe('Short label, e.g. "This week" or "Before the next mock"'), task: z.string() })).describe('3-5 ordered steps'),
});

const REPORT_TASK = {
  overall: `Write a coach report on this student's preparation across all their papers. Compare with the previous ` +
    `report if there is one: say what improved and what did not. Focus on the few changes that would add the most marks.`,
  attempt: `Write a coach report on this one paper: where the marks were lost (knowledge vs technique), which mistakes ` +
    `matter most (cite question numbers), how time was used, and what to do before the next paper. ` +
    `Relate it to the student's other papers where that helps.`,
};

// Offline reports predate the status field, so "ready" means anything not pending or failed.
const READY = { status: { $nin: ['pending', 'failed'] } };

const usageOf = (u) => u && { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens || 0 };

// Fill in a pending AI report. Runs in a background function (or in-process in local dev).
export async function runReportJob(reportId) {
  const report = await AnalysisReport.findById(reportId);
  if (!report || report.status !== 'pending') return;
  try {
    const user = await User.findById(report.user).lean();
    const items = await loadSubmitted(report.user);
    let context;
    if (report.scope === 'attempt') {
      const overallReport = await AnalysisReport.findOne({ user: report.user, scope: { $ne: 'attempt' }, ...READY }).sort({ createdAt: -1 }).lean();
      context = attemptContext(user, items, report.attempt, { overallReport });
      if (!context) throw new Error('This paper is no longer available');
    } else {
      const previousReport = await AnalysisReport.findOne({ user: report.user, scope: { $ne: 'attempt' }, ...READY, _id: { $ne: report._id } }).sort({ createdAt: -1 }).lean();
      context = overallContext(user, items, { previousReport });
    }
    const msg = await claude().beta.messages.parse({
      ...FALLBACK,
      model: MODEL(),
      max_tokens: 16000,
      output_config: { effort: 'high', format: betaZodOutputFormat(ReportSchema) },
      system: COACH,
      messages: [{ role: 'user', content: `<student_data>\n${context}\n</student_data>\n\n${REPORT_TASK[report.scope]}` }],
    });
    if (msg.stop_reason === 'refusal') throw new Error('The AI coach could not write this report. Please try again later.');
    if (msg.stop_reason === 'max_tokens' || !msg.parsed_output) throw new Error('The AI coach returned an incomplete report. Please try again.');
    const scoped = report.scope === 'attempt' ? items.filter((it) => String(it.attempt._id) === String(report.attempt)) : items;
    const out = msg.parsed_output;
    const sev = (v) => (['high', 'medium', 'low'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : 'medium');
    report.set({
      ...out,
      weakTopics: out.weakTopics.map((w) => ({ ...w, severity: sev(w.severity) })),
      author: 'MockMitra AI coach',
      status: 'ready',
      error: undefined,
      model: msg.model,
      usage: usageOf(msg.usage),
      basedOn: {
        attempts: scoped.length,
        questions: scoped.reduce((n, it) => n + it.test.questions.length, 0),
        through: scoped.at(-1)?.attempt.submittedAt,
      },
    });
  } catch (e) {
    console.error('coach report failed', reportId, e);
    report.set({ status: 'failed', error: friendlyError(e) });
  }
  await report.save();
}

// ---------- Q&A ----------

const CHAT_TASK = `Answer the student's questions about their results and preparation. Keep answers short (under ` +
  `200 words) unless they ask for detail or for a worked solution. When they ask about a specific question, use its ` +
  `text, answer and explanation from the data and explain the method step by step. If something is not in the data, ` +
  `say so. Stay on exam preparation; politely decline unrelated requests.`;

export async function answerChat({ userId, attemptId, history, question }) {
  const user = await User.findById(userId).lean();
  const items = await loadSubmitted(userId);
  const overallReport = await AnalysisReport.findOne({ user: userId, scope: { $ne: 'attempt' }, ...READY }).sort({ createdAt: -1 }).lean();
  let context;
  if (attemptId) {
    const paperReport = await AnalysisReport.findOne({ user: userId, scope: 'attempt', attempt: attemptId, ...READY }).sort({ createdAt: -1 }).lean();
    context = attemptContext(user, items, attemptId, { paperReport, overallReport });
    if (!context) throw Object.assign(new Error('Paper not found'), { status: 404 });
  } else {
    context = overallContext(user, items, { previousReport: overallReport });
  }
  const msg = await claude().beta.messages.create({
    ...FALLBACK,
    model: MODEL(),
    max_tokens: 8000,
    output_config: { effort: 'medium' },
    // The student's data is the stable prefix; cache it so follow-up questions are cheap and fast.
    system: [
      { type: 'text', text: `${COACH}\n\n${CHAT_TASK}` },
      { type: 'text', text: `<student_data>\n${context}\n</student_data>`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: question }],
  }, { timeout: 50_000, maxRetries: 1 }); // stay inside the 60 s function limit
  if (msg.stop_reason === 'refusal') return "Sorry, I can't help with that one. Try asking about your results or a topic you're preparing.";
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text) throw new Error('The AI coach returned an empty answer. Please try again.');
  return text;
}

export function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'The AI coach is not configured correctly (invalid API key).';
  if (e instanceof Anthropic.RateLimitError) return 'The AI coach is busy right now. Please try again in a minute.';
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'The AI coach took too long to answer. Please try again.';
  if (e instanceof Anthropic.APIError) return 'The AI coach is unavailable right now. Please try again later.';
  return e.message || 'Something went wrong.';
}

