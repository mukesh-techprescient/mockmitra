#!/usr/bin/env node
// Offline PDF -> test JSON converter (uses Claude vision).
//
//   npm run pdf2json -- paper.pdf --category mht-cet --title "MHT-CET 2025 (PCM)" \
//        --year 2025 --duration 180 --out samples/mht-cet-2025.json
//
// Steps: render pages (pdftoppm) -> extract questions/solutions per page -> merge ->
// crop figures -> write explanations -> validate against the app's schema -> write JSON.
// Per-page results are cached in tools/pdf2json/.work/<pdf-name>/ so reruns are cheap.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { EXTRACT_SYSTEM, EXTRACT_SCHEMA, EXPLAIN_SYSTEM, EXPLAIN_SCHEMA } from './prompts.js';
import { testFileSchema, formatZodError } from '../../server/lib/testSchema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5-5';
const MAX_EDGE = 1568; // keep page images at the size Claude actually sees, so boxes line up

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    category: { type: 'string' },
    title: { type: 'string' },
    year: { type: 'string' },
    duration: { type: 'string', default: '180' },
    correct: { type: 'string', default: '1' },
    incorrect: { type: 'string', default: '0' },
    pages: { type: 'string' },             // e.g. "1-13" (default: all)
    out: { type: 'string' },
    'no-explain': { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    fresh: { type: 'boolean', default: false }, // ignore cache
  },
});

const pdf = positionals[0];
if (!pdf || !opt.category || !opt.title) {
  console.error('usage: npm run pdf2json -- <file.pdf> --category <slug> --title "<title>" [--year 2025] [--duration 180]\n' +
    '         [--correct 1] [--incorrect 0] [--pages 1-13] [--out file.json] [--no-explain] [--fresh]');
  process.exit(1);
}

const client = new Anthropic();
const work = path.join(here, '.work', path.basename(pdf, '.pdf').replace(/[^\w-]+/g, '_'));
fs.mkdirSync(work, { recursive: true });
const log = (...a) => console.log('•', ...a);

// ---------- helpers
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// Structured-output call; streamed so long responses don't hit HTTP timeouts.
async function callClaude({ system, content, schema, effort = 'high' }) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error(`Claude declined: ${msg.stop_details?.explanation ?? 'refusal'}`);
  if (msg.stop_reason === 'max_tokens') throw new Error('Response hit max_tokens');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

const imgBlock = (buf, media = 'image/png') => ({ type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } });

// ---------- 1. render pages
function renderPages() {
  const existing = fs.readdirSync(work).filter((f) => /^page-\d+\.png$/.test(f));
  if (!existing.length || opt.fresh) {
    log('Rendering pages…');
    execFileSync('pdftoppm', ['-r', '200', '-png', pdf, path.join(work, 'raw')]);
  }
  const raws = fs.readdirSync(work).filter((f) => /^raw-\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  let pages = raws.map((f, i) => ({ n: i + 1, raw: path.join(work, f), png: path.join(work, `page-${i + 1}.png`) }));
  if (opt.pages) {
    const [a, b] = opt.pages.split('-').map(Number);
    pages = pages.filter((p) => p.n >= a && p.n <= (b || a));
  }
  return pages;
}

async function preparePage(p) {
  if (!fs.existsSync(p.png)) {
    await sharp(p.raw).resize(MAX_EDGE, MAX_EDGE, { fit: 'inside' }).png().toFile(p.png);
  }
  return p;
}

// ---------- 2. extract per page
async function extractPage(p) {
  const cache = path.join(work, `page-${p.n}.json`);
  if (fs.existsSync(cache) && !opt.fresh) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const res = await callClaude({
    system: EXTRACT_SYSTEM,
    schema: EXTRACT_SCHEMA,
    content: [imgBlock(fs.readFileSync(p.png)), { type: 'text', text: `This is page ${p.n}. Extract everything.` }],
  });
  fs.writeFileSync(cache, JSON.stringify(res, null, 2));
  log(`page ${p.n}: ${res.pageType}, ${res.questions.length} questions, ${res.solutions.length} solutions`);
  return res;
}

// ---------- 3. figure crops
// box is 0-1000 relative to the page; crop from the full-resolution render for sharp figures.
async function crop(page, box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const { width: W, height: H } = await sharp(page.raw).metadata();
  const pad = 0.006;
  const [x0, x1] = [Math.min(box[0], box[2]), Math.max(box[0], box[2])].map((v) => v / 1000);
  const [y0, y1] = [Math.min(box[1], box[3]), Math.max(box[1], box[3])].map((v) => v / 1000);
  const left = Math.max(0, Math.floor((x0 - pad) * W));
  const top = Math.max(0, Math.floor((y0 - pad) * H));
  const width = Math.min(W - left, Math.ceil((x1 + pad) * W) - left);
  const height = Math.min(H - top, Math.ceil((y1 + pad) * H) - top);
  if (width < 12 || height < 12) return null;
  const buf = await sharp(page.raw)
    .extract({ left, top, width, height })
    .resize({ width: 900, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// ---------- 4. merge
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function merge(pages, results) {
  const questions = new Map(); // number -> q
  const solutions = new Map();
  const instructions = [];
  let section = null;
  let last = null;

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i], r = results[i];
    instructions.push(...r.instructions);
    for (const q of r.questions) {
      const target = q.continuation || q.number == null ? last : null;
      if (target) {
        // Tail of the previous page's last question.
        if (q.text) target.text = `${target.text}\n${q.text}`.trim();
        if (q.figure && !target.image) target.image = await crop(p, q.figure);
        for (const o of q.options) if (!target.options.some((x) => x.key === o.key))
          target.options.push({ key: o.key.toLowerCase(), text: o.text, image: await crop(p, o.figure) });
        continue;
      }
      if (q.number == null) continue;
      if (q.sectionHeading) section = q.sectionHeading.trim();
      const existing = questions.get(q.number);
      const rec = existing || { number: q.number, section: section || 'General', text: '', image: null, options: [] };
      rec.text = [rec.text, q.text].filter(Boolean).join('\n');
      if (q.figure && !rec.image) rec.image = await crop(p, q.figure);
      for (const o of q.options) if (!rec.options.some((x) => x.key === o.key.toLowerCase()))
        rec.options.push({ key: o.key.toLowerCase(), text: o.text, image: await crop(p, o.figure) });
      questions.set(q.number, rec);
      last = rec;
    }
    for (const s of r.solutions) {
      const prev = solutions.get(s.number);
      solutions.set(s.number, {
        answer: (s.answer || prev?.answer || '').toLowerCase().replace(/[^a-z]/g, '') || null,
        text: [prev?.text, s.text].filter(Boolean).join('\n'),
        image: prev?.image || (await crop(p, s.figure)),
      });
    }
  }
  const list = [...questions.values()].sort((a, b) => a.number - b.number);
  for (const q of list) q.options.sort((a, b) => a.key.localeCompare(b.key));
  return { list, solutions, instructions: [...new Set(instructions)] };
}

// ---------- 5. explanations
async function explain(list, solutions) {
  const cache = path.join(work, 'explanations.json');
  const done = fs.existsSync(cache) && !opt.fresh ? JSON.parse(fs.readFileSync(cache, 'utf8')) : {};
  const todo = list.filter((q) => !done[q.number]);
  const batches = [];
  for (let i = 0; i < todo.length; i += 8) batches.push(todo.slice(i, i + 8));
  await pool(batches, Number(opt.concurrency), async (batch) => {
    const content = [];
    for (const q of batch) {
      const sol = solutions.get(q.number);
      content.push({ type: 'text', text:
        `### Question ${q.number} (${q.section})\n${q.text}\n` +
        q.options.map((o) => `(${o.key}) ${o.text}${o.image ? ' [figure below]' : ''}`).join('\n') +
        `\nOfficial answer key: ${sol?.answer ?? 'not available'}` +
        (sol?.text ? `\nOfficial solution:\n${sol.text}` : '') });
      const imgs = [q.image, ...q.options.map((o) => o.image)].filter(Boolean);
      for (const d of imgs) content.push(imgBlock(Buffer.from(d.split(',')[1], 'base64')));
    }
    content.push({ type: 'text', text: `Return one item per question above (${batch.map((q) => q.number).join(', ')}).` });
    const res = await callClaude({ system: EXPLAIN_SYSTEM, schema: EXPLAIN_SCHEMA, content });
    for (const it of res.items) done[it.number] = it;
    fs.writeFileSync(cache, JSON.stringify(done, null, 2));
    log(`explained ${batch[0].number}–${batch.at(-1).number}`);
  });
  return done;
}

// ---------- main
const pages = await pool(renderPages(), 8, preparePage);
log(`${pages.length} pages; extracting with ${MODEL}…`);
const results = await pool(pages, Number(opt.concurrency), extractPage);
const { list, solutions, instructions } = await merge(pages, results);
log(`merged ${list.length} questions, ${solutions.size} solutions`);

const expl = opt['no-explain'] ? {} : await explain(list, solutions);

const review = [];
const sections = [];
const questions = list.map((q) => {
  const sid = slug(q.section) || 'general';
  if (!sections.some((s) => s.id === sid)) sections.push({ id: sid, name: q.section });
  const sol = solutions.get(q.number);
  const e = expl[q.number];
  const answer = sol?.answer || e?.answer?.toLowerCase();
  if (!sol?.answer) review.push(`Q${q.number}: no official answer key — using Claude's answer (${e?.answer ?? 'none'})`);
  if (e && e.agreesWithKey === false) review.push(`Q${q.number}: Claude disagrees with key (${sol?.answer} vs ${e.answer}) — check`);
  if (q.options.length < 4) review.push(`Q${q.number}: only ${q.options.length} options extracted`);
  return {
    id: `q${q.number}`,
    number: q.number,
    section: sid,
    topic: e?.topic,
    difficulty: e?.difficulty,
    text: q.text,
    image: q.image,
    options: q.options,
    answer: answer || 'a',
    explanation: e?.explanation || sol?.text || '',
    explanationImage: sol?.image || null,
  };
});
const missing = [];
for (let n = 1; n <= (list.at(-1)?.number || 0); n++) if (!list.some((q) => q.number === n)) missing.push(n);
if (missing.length) review.push(`Missing question numbers: ${missing.join(', ')}`);

const out = {
  schemaVersion: 1,
  title: opt.title,
  category: opt.category,
  year: opt.year ? Number(opt.year) : undefined,
  durationMinutes: Number(opt.duration),
  marking: { correct: Number(opt.correct), incorrect: Number(opt.incorrect), unattempted: 0 },
  instructions,
  sections,
  questions,
};

const outFile = opt.out || `${path.basename(pdf, '.pdf')}.json`;
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
const v = testFileSchema.safeParse(out);
console.log(`\nWrote ${outFile} — ${questions.length} questions in ${sections.length} sections (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
if (!v.success) console.log('\n⚠ Schema problems:\n  ' + formatZodError(v.error).join('\n  '));
if (review.length) {
  fs.writeFileSync(outFile.replace(/\.json$/, '') + '.review.txt', review.join('\n') + '\n');
  console.log(`\n⚠ ${review.length} items need a human look (see ${outFile.replace(/\.json$/, '')}.review.txt):`);
  console.log('  ' + review.slice(0, 15).join('\n  '));
}
