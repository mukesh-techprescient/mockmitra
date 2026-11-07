# Hand-off — state as of 15 Oct 2026

Work moved to another computer. This branch (`ai-coach`) holds the latest code; **it is not deployed**.
`main` on GitHub is what is live on Netlify.

## 1. AI coach (this branch) — built and tested locally, not deployed
Three features using the Claude API (`claude-opus-5-5`):
- **Regenerate coach report** — button on Insights. Claude reads all of the student's papers plus the
  previous report and writes a report in the existing coach-report format.
- **Paper insights** — "Analyse this paper" on each result's review page.
- **Ask the coach** — Q&A chat on Insights (all papers) and on each review page (that paper); threads are
  saved, "New conversation" clears one.

Code: `server/lib/coachAI.js` (prompts, structured output, chat), `server/lib/coachContext.js` (compact
plain-text view of a student's results, ~16K tokens for 5 papers), `server/lib/aiJobs.js` (signed job
dispatch), `netlify/functions/coach-background.js`, routes in `server/routes/insights.js`, UI in
`web/src/components/AICoach.jsx` (+ Insights.jsx, Review.jsx, CoachReport.jsx, styles.css), model
`server/models/CoachChat.js`, new fields on `AnalysisReport` (scope/attempt/source/status/error/model/usage).

How it works:
- Reports take ~70 s, longer than Netlify's 60 s sync limit, so the API creates a `pending` report and
  POSTs a signed job id (HMAC with `JWT_SECRET`) to the background function; the page polls
  `GET /api/insights/reports/:id`. Locally (no `NETLIFY` env) the job runs in-process. Pending jobs older
  than 16 min are marked failed.
- Chat is a normal request (answers in 10–25 s); the student data is prompt-cached across turns.
- Server-side refusal fallback is on (`fallbacks: "default"`). Reports use effort `high`, chat `medium`.
- Daily limits per student: 6 reports, 60 questions (env `AI_DAILY_REPORTS`, `AI_DAILY_MESSAGES`).
- No `ANTHROPIC_API_KEY` → every AI control is hidden; offline reports still show.
- Cost seen in testing: ~30K input / ~7K output tokens per report (≈ $0.25); a few cents per question.

Tested locally against the live Atlas DB: overall report, FT4 paper report, both chats (API and UI),
KaTeX rendering, background-function signature check, esbuild bundling of both functions.
**Not tested:** the Netlify dispatch to the background function (only runs on Netlify).

To deploy:
1. Netlify → Site configuration → Environment variables: add `ANTHROPIC_API_KEY`.
2. Merge `ai-coach` into `main` and push (this triggers a build). After deploy, click "Regenerate coach
   report" on Insights and confirm it finishes (check the function logs for `coach-background` if not).

## 2. Content in the database (Atlas, db `mockmitra`)
- BITSAT category: Mock Test 1, Mock Test 2, FT3–FT10 (all 130 Q, published, answer keys cross-checked by a
  blind solve). Listed newest-first by `createdAt`; FT4–FT10 timestamps were set so the list reads
  FT10 → FT4 → FT3 → Mock 2 → Mock 1. Known paper flaws are noted in each question's explanation.
- MHT-CET papers (2020–2025) are also imported.
- The main student account has offline coach reports plus AI-generated ones from testing.

## 3. Not in git (copy privately if needed)
- `.env` (Atlas URI, JWT secret, Anthropic key) and `atlas-credentials.env`.
- `samples/bitsat-*-full.json`, `samples/pdfs/` — full paper JSON/PDFs (copyrighted; kept out of the public
  repo). Only needed to re-import; the tests are already in Atlas.
- `analysis/` — student performance exports, offline coach reports, and the maths weak-topic question
  bank PDF (`analysis/out/Maths-Weak-Topic-Bank.pdf`).
- `android/` — a Capacitor Android wrapper, untracked. Its bundled JS still points at the old Netlify URL
  (`precious-croquembouche-9a8bb5.netlify.app`, now 404); `web/src/api.js` has no API-base setting yet, so
  the app needs that added and a rebuild.

## 4. Open items / ideas
- Deploy the AI coach (section 1).
- Android app: add an API base URL setting and rebuild (section 3).
- Optional: load the 74-question maths weak-topic bank into the app as a practice test.
- Optional: sort tests by paper number instead of newest-first.
