# MockMitra — design

Practice-exam app for CET / NEET / BITSAT / SAT style multiple-choice papers.

```
 PDF paper ──► tools/pdf2json (offline, Claude vision) ──► test.json ──► Admin upload ──► MongoDB
                                                                                         │
 Student ◄── React SPA (Netlify CDN) ◄── /api/* ── Express app (Netlify Function) ◄──────┘
```

## Roles
| | Student | Admin |
|---|---|---|
| Sign up | self-register | `npm run seed:admin` only (no self-promotion) |
| Browse tests grouped by category | ✔ | ✔ |
| Take test (timer, palette, mark-for-review, autosave, resume) | ✔ | ✔ |
| History + review with explanations | ✔ | ✔ |
| Categories CRUD, upload / replace / publish / delete tests | | ✔ |

## Stack
- **Frontend**: React 18 + Vite + React Router, KaTeX for math. Built to `dist/`, served by Netlify.
- **API**: one Express app (`server/app.js`). On Netlify it runs as a single function (`netlify/functions/api.js`
  via `serverless-http`); `/api/*` is redirected to it. Locally it runs with `node server/dev.js`.
  Moving to a long-running backend later (Render, Railway, Fly, EC2) = run `server/dev.js` there and point
  the `/api` redirect at it — no code changes.
- **DB**: MongoDB (Atlas free tier works) via Mongoose. Connection cached across warm invocations.
- **Auth**: email + bcrypt password, JWT (7 days) sent as `Authorization: Bearer`. Bearer (not cookies) keeps
  the API usable cross-origin when it moves off Netlify.

## Data model
- **Category** `{name, slug, description, order}` — "MHT-CET", "NEET", "BITSAT"… admin-defined.
- **Test** `{title, category, year, durationMinutes, marking{correct,incorrect,unattempted}, instructions[], sources[{label,url}],
  sections[{id,name}], questions[], published}` — questions are embedded (150 Qs ≈ 300 KB, far under 16 MB)
  so a test loads in one read.
  - question `{qid, number, section, topic, difficulty, text, image, options[{key,text,image}], answer, explanation, explanationImage}`
- **Asset** `{contentType, data, test}` — figures. Uploaded JSON may embed figures as `data:` URIs; import
  moves them here and rewrites to `/api/assets/:id` (immutable cache headers).
- **Attempt** `{user, test, status, startedAt, deadline, submittedAt, answers[{qid, selected, flagged, timeSpentSec}], result}`
  - `result` = totals + per-section breakdown, computed server-side on submit.

## Key behaviours
- **Answers never leave the server during an exam.** `POST /attempts` returns questions without `answer`/`explanation`;
  `GET /attempts/:id` (review) refuses until the attempt is submitted.
- **Timer is server-authoritative**: `deadline` is set at start; the client corrects for clock skew; late saves
  (> 30 s grace) are rejected; an expired in-progress attempt is auto-finalised on next start.
- **Resume**: starting a test with an in-progress attempt resumes it (closing the tab doesn't lose work).
- **Autosave**: answer/flag/time changes are batched and PATCHed every ~0.8 s, retried when offline, flushed with
  `keepalive` on tab close.
- **Retake**: each submit is a separate attempt; history shows all; catalog shows best score.
- **Replace JSON** keeps the test id and attempts; reviews match by question `id`, so keep ids stable when fixing a paper.

## Test JSON (schemaVersion 1)
Validated by `server/lib/testSchema.js` (shared by the API, the CLI importer and the PDF tool).
```jsonc
{
  "schemaVersion": 1,
  "title": "MHT-CET 2025 (PCM)",
  "category": "mht-cet",              // category slug; auto-created if missing
  "year": 2025,
  "durationMinutes": 180,
  "marking": { "correct": 1, "incorrect": 0, "unattempted": 0 },   // e.g. NEET: 4 / -1 / 0
  "instructions": ["..."],
  "sources": [{ "label": "Question paper (PDF)", "url": "https://..." }],   // optional; links on the test page
  "sections": [{ "id": "physics", "name": "Physics" }],
  "questions": [{
    "id": "q1", "number": 1, "section": "physics",
    "topic": "Waves", "difficulty": "easy",
    "text": "Speed of sound $v = \\sqrt{\\gamma RT/M}$ ...",  // $inline$ / $$display$$ LaTeX, **bold**
    "image": null,                                      // URL or data:image/png;base64,...
    "options": [{ "key": "a", "text": "...", "image": null }, ...],
    "answer": "a",
    "explanation": "...",
    "explanationImage": null
  }]
}
```

## PDF → JSON (offline)
Sample papers are scanned images (no text layer), with formulas, circuit diagrams and chemical structures,
and usually a worked-solutions section at the back. `tools/pdf2json`:
1. renders pages with `pdftoppm` (200 dpi);
2. sends each page to Claude (vision, structured JSON output) → questions, options, section headings,
   solutions/answer keys, and **bounding boxes** for figures (stem and per-option);
3. merges across pages/columns (continuations), crops figures with `sharp`;
4. second pass: Claude writes a student-friendly explanation per question using the official solution,
   independently solves it, and tags topic + difficulty;
5. flags anything a human should check in `<out>.review.txt` — missing numbers, < 4 options, no answer key,
   **Claude disagrees with the published key** (the sample paper's key is wrong on Q11);
6. validates against the app schema.
Per-page results are cached in `tools/pdf2json/.work/`, so you can fix a page and rerun cheaply.

## Netlify notes / limits
- Function request body ≤ ~6 MB → large papers with many figures: use `npm run import -- file.json` from your machine.
- Function timeout 10 s (default) is fine for all endpoints; the PDF conversion runs offline, not on Netlify.

## Later
Negative-marking presets per category, per-topic analytics across attempts, leaderboard, question bank / custom
tests mixed from many papers, password reset email, move figures to object storage (S3/R2/Cloudinary).

## Weak-topic analysis
Two complementary layers, both driven by each question's `topic` tag.

### 1. Statistical (live, automatic)
`server/lib/topicStats.js` — pure function over a student's submitted attempts.
- Per topic (keyed by subject + topic) and per subject: seen, correct, incorrect, skipped, accuracy on attempted, avg time.
- **Mastery** is shrunk toward the student's own subject average so small samples don't produce false alarms:
  `mastery = (correct + K·subjectRate) / (seen + K)`, K = 4 (subjects use `(correct+1)/(seen+2)`).
- Verdicts: `weak` < 0.45 ≤ `developing` < 0.70 ≤ `strong`; `insufficient` when fewer than 3 questions seen.
- Skipped questions count as not correct (skipping a topic is itself a signal).
- Surfaces: **Insights** page (`GET /api/insights`: all tests, weakest first, per-subject, score trend) and the
  results page (`GET /api/attempts/:id` → `topics`; single-test view lists where marks were lost).

### 2. Offline coaching report (human/Claude-written, uploaded)
1. Export: `npm run analysis:export -- student@email` (or Admin → Students → Export JSON) →
   `analysis/in/<email>.json` with the statistical summary plus every question: subject, topic, difficulty,
   status, chosen vs correct option, time spent, flagged, short stem text. (`analysis/` is git-ignored — student data.)
2. Analyse offline — look for patterns the per-topic table can't show: clusters of related topics, guessing under
   negative marking (fast wrong answers), easy questions lost, skipping habits, time allocation.
3. Write a report JSON (below) and upload: `npm run analysis:upload -- file.json` or Admin → Students → Upload.
   It appears as **Coach's report** at the top of the student's Insights page (latest first; older ones collapsible).

### Analysis report (schemaVersion 1)
Validated by `server/lib/analysisSchema.js`. Text fields support `$LaTeX$` and `**bold**` (no single-`*` italics).
Example: `samples/analysis-report-example.json`.
```jsonc
{
  "schemaVersion": 1, "kind": "analysis",
  "userEmail": "student@example.com",          // must match an existing user
  "title": "Your first three mocks: where the marks are going",
  "summary": "…",                              // 2–4 sentences
  "basedOn": { "attempts": 3, "questions": 410, "through": "2026-10-08" },
  "weakTopics": [{ "subject": "Chemistry", "topic": "Organic chemistry", "severity": "high|medium|low",
                   "evidence": "7/34 correct (21%) vs 55% on the rest of Chemistry…", "advice": "…" }],
  "habits":    [{ "title": "Guessing is costing ~23 marks per BITSAT paper", "detail": "…" }],
  "strengths": [{ "subject": "Mathematics", "topic": "Overall", "note": "…" }],
  "plan":      [{ "step": "Days 1–4", "task": "…" }],
  "author": "MockMitra coach"
}
```
