#!/usr/bin/env node
// Build a test JSON for a BITSAT-format paper from hand-written section data files.
//   node tools/paper-build/build.mjs <workdir> --title "BITSAT Full Test 4 (FT4)" --out samples/bitsat-ft4-full.json
// <workdir> contains:
//   data/phys.mjs (30), data/chem.mjs (30), data/math.mjs (40), data/eng.mjs (30: Q1–10 English, Q11–30 LR)
//     (with --lr-first: the paper prints LR as Q1–20 and English as Q21–30)
//     each: export default [[n, text, options, answer, topic, difficulty, explanation, figureKey?], …]
//     an option is a string, or { text, img } where img is a figure key
//   figmap.json: { "<figureKey>": "<png basename without .png in img/>" }
//   img/*.png: figures extracted with `pdfimages -png -p <pdf> <workdir>/img/im`
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  title: { type: 'string' }, 'lr-first': { type: 'boolean' }, out: { type: 'string' }, description: { type: 'string' },
} });
const W = path.resolve(positionals[0] || '');
if (!positionals[0] || !opt.title || !opt.out) {
  console.error('usage: node tools/paper-build/build.mjs <workdir> --title "<title>" --out <file.json> [--description "..."] [--lr-first]');
  process.exit(1);
}
const map = fs.existsSync(`${W}/figmap.json`) ? JSON.parse(fs.readFileSync(`${W}/figmap.json`, 'utf8')) : {};
const cache = {};
async function img(k) {
  if (cache[k]) return cache[k];
  if (!map[k]) throw new Error(`figure key "${k}" is not in figmap.json`);
  const f = `${W}/img/${map[k]}.png`;
  const { width } = await sharp(f).metadata();
  const buf = await sharp(f).flatten({ background: '#fff' })
    .resize({ width: width < 320 ? width * 2 : width, kernel: 'lanczos3' })
    .png({ palette: true, compressionLevel: 9 }).toBuffer();
  return (cache[k] = `data:image/png;base64,${buf.toString('base64')}`);
}
const load = (f) => import(pathToFileURL(`${W}/data/${f}.mjs`).href).then((m) => m.default);
const [phys, chem, math, eng] = await Promise.all(['phys', 'chem', 'math', 'eng'].map(load));
const expect = { phys: 30, chem: 30, math: 40, eng: 30 };
for (const [k, arr] of Object.entries({ phys, chem, math, eng })) {
  if (arr.length !== expect[k]) throw new Error(`${k}: expected ${expect[k]} questions, got ${arr.length}`);
  arr.forEach((q, i) => {
    if (q[0] !== i + 1) throw new Error(`${k}: question at index ${i} is numbered ${q[0]}`);
    if (!['a', 'b', 'c', 'd'].includes(q[3])) throw new Error(`${k} Q${q[0]}: answer must be a–d`);
    if (q[2].length !== 4) throw new Error(`${k} Q${q[0]}: expected 4 options`);
    if (/(^|[^*])\*(?!\*)/.test(JSON.stringify(q).replace(/\*\*/g, ''))) throw new Error(`${k} Q${q[0]}: single * found (use **bold** only)`);
  });
}
const blocks = [
  ['physics', 'p', phys], ['chemistry', 'c', chem], ['mathematics', 'm', math],
  ...(opt['lr-first']
    ? [['english', 'e', eng.filter((q) => q[0] > 20)], ['lr', 'e', eng.filter((q) => q[0] <= 20)]]
    : [['english', 'e', eng.filter((q) => q[0] <= 10)], ['lr', 'e', eng.filter((q) => q[0] > 10)]]),
];
const questions = [];
let n = 0;
for (const [section, pre, list] of blocks) {
  for (const [num, text, opts, answer, topic, difficulty, explanation, fig] of list) {
    questions.push({
      id: `${pre}${num}`, number: ++n, section, topic, difficulty, text,
      image: fig ? await img(fig) : null,
      options: await Promise.all(opts.map(async (o, i) => typeof o === 'string'
        ? { key: 'abcd'[i], text: o, image: null }
        : { key: 'abcd'[i], text: o.text || '', image: await img(o.img) })),
      answer, explanation,
    });
  }
}
const test = {
  schemaVersion: 1,
  title: opt.title,
  category: 'bitsat',
  description: opt.description || `Full-length 130-question BITSAT mock: Physics 30, Chemistry 30, Mathematics 40, English 10, Logical Reasoning 20. The source paper had no answer key; answers and explanations were worked out question by question and cross-checked by an independent solve.`,
  durationMinutes: 180,
  marking: { correct: 3, incorrect: -1, unattempted: 0 },
  instructions: [
    '130 multiple-choice questions: Physics (30), Chemistry (30), Mathematics (40), English Proficiency (10) and Logical Reasoning (20).',
    'Each question has four options, of which only one is correct.',
    'Marking: +3 for a correct answer, −1 for a wrong answer, 0 if not attempted.',
    'Duration: 3 hours.',
  ],
  sections: [
    { id: 'physics', name: 'Physics' }, { id: 'chemistry', name: 'Chemistry' }, { id: 'mathematics', name: 'Mathematics' },
    { id: 'english', name: 'English Proficiency' }, { id: 'lr', name: 'Logical Reasoning' },
  ],
  questions,
};
const out = path.resolve(opt.out);
fs.writeFileSync(out, JSON.stringify(test, null, 2));
const { testFileSchema, formatZodError } = await import(pathToFileURL(`${ROOT}/server/lib/testSchema.js`).href);
const v = testFileSchema.safeParse(test);
const unused = Object.keys(map).filter((k) => !cache[k]);
console.log(v.success ? 'schema: valid' : 'SCHEMA ERRORS:\n  ' + formatZodError(v.error).join('\n  '));
console.log('questions', questions.length, '| figures used', Object.keys(cache).length, unused.length ? `| UNUSED figmap keys: ${unused.join(', ')}` : '');
console.log('answers', ['a', 'b', 'c', 'd'].map((k) => k + ':' + questions.filter((q) => q.answer === k).length).join(' '));
console.log('wrote', path.relative(process.cwd(), out), (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
// Answer key line for cross-checking
console.log('KEY', blocks.map(([s, , l]) => s + '=' + l.map((q) => q[3]).join('')).join(' '));
