# MockMitra — notes for Claude Code

Practice-exam web app for Indian entrance exams (BITSAT, MHT-CET, NEET, JEE…). Students take timed MCQ
tests, review answers with explanations, see weak-topic analysis, keep mistake notebooks, and get coach
reports (offline or AI-generated). Live at **https://mockmitra.netlify.app**. This repo is **public**:
never commit secrets, `.env`, student data, or full paper JSON/PDFs.

**Start here:** read `HANDOFF.md` for the current state of work and open items. `DESIGN.md` has the
data model and test JSON schema; `README.md` has setup.

## Stack and layout
- React 18 + Vite SPA in `web/` (react-router; KaTeX via `web/src/components/Rich.jsx`).
- Express API in `server/`, deployed as one Netlify Function (`netlify/functions/api.js`, `/api/*` redirect).
  Long AI jobs run in `netlify/functions/coach-background.js` (background function, 15 min limit).
- MongoDB Atlas via mongoose. `dbName` is pinned to `mockmitra` (`MONGODB_DB` overrides) in `server/db.js`.
- JWT auth (`server/lib/auth.js`), roles `student` / `admin`; admin is created only by `npm run seed:admin`.

## Commands
- `npm run dev` — web on :5173 and API on :8888 (API uses `API_PORT`, not `PORT`). Vite proxies `/api`.
- `node scripts/import-test.js <file.json> --publish [--replace <testId>]` — import a test. Run the script
  directly (npm notices can hide its output) and **only once**: a second run creates a duplicate test.
  Use `--replace <id>` to update a test in place.
- `node tools/paper-build/build.mjs <workdir> --title "..." --out samples/x.json [--lr-first]` — build a
  BITSAT-format test JSON from hand-written section data files (see the header comment in the script).
- `npm run analysis:export -- <email>` / `npm run analysis:upload -- <file>` — offline coach reports.
- `npx vite build` — frontend build check.

## Environment (`.env`, never committed; see `.env.example`)
`MONGODB_URI`, `JWT_SECRET`, `ANTHROPIC_API_KEY` (AI coach; Anthropic keys start `sk-ant-`),
optional `MONGODB_DB`, `CLAUDE_MODEL` (default `claude-opus-5-5`), `AI_DAILY_REPORTS` (6), `AI_DAILY_MESSAGES` (60).
The same variables must be set in Netlify → Site configuration → Environment variables.

## Conventions
- Question/explanation/report text supports only `$inline$`, `$$display$$` LaTeX and `**bold**`, plus line
  breaks. Never a single `*` (renders literally). The paper builder rejects single `*`.
- Test JSON schema v1 is validated by zod in `server/lib/testSchema.js`; images are data URIs that the
  importer moves into the `Asset` collection (`/api/assets/:id`).
- Topic stats (`server/lib/topicStats.js`): mastery = (correct + 4·subjectRate)/(seen + 4); weak < 0.45 ≤
  developing < 0.70 ≤ strong; < 3 seen = insufficient. Sections skipped entirely in an attempt are excluded.
- Match the surrounding code style: small modules, comments only where the why is not obvious.

## Deploys — Netlify credits are limited
- **Pushing `main` triggers a production build on Netlify.** Work on a feature branch.
- Put `[skip netlify]` in commit messages for pushes that should not build (Netlify skips the build when
  the latest commit message contains it).

## Converting a paper PDF (no answer key in the PDF)
1. `pdfimages -png -p` to extract figures; read pages visually (the text layer garbles maths).
2. Write `data/{phys,chem,math,eng}.mjs` + `figmap.json`; build with `tools/paper-build/build.mjs`.
   Many BITSAT papers print Logical Reasoning before English: use `--lr-first` (check topics!).
3. Have an independent agent solve the PDF blind; reconcile every disagreement by re-reading the
   question/figure; note paper flaws in the explanation.
4. Import once with `--publish`; check KaTeX renders and figures load.
