# MockMitra

Practice-test web app for CET / NEET / BITSAT / SAT style MCQ papers. Admins upload papers as JSON
(converted offline from PDF with Claude); students take timed tests and review answers with explanations.
Design: [DESIGN.md](DESIGN.md).

## Run locally
```bash
npm install
cp .env.example .env           # set MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
# no MongoDB? docker run -d --name mockmitra-mongo -p 27017:27017 mongo:7  → MONGODB_URI=mongodb://localhost:27017/mockmitra
npm run seed:admin             # creates the admin account from .env
npm run import -- samples/mht-cet-2025-physics-sample.json --publish
npm run dev                    # web http://localhost:5173, API http://localhost:8888/api
```

## Convert a PDF paper
Requires `pdftoppm` (`brew install poppler`) and `ANTHROPIC_API_KEY` in `.env`.
```bash
npm run pdf2json -- "paper.pdf" --category mht-cet --title "MHT-CET 2025 (PCM)" \
  --year 2025 --duration 180 --correct 1 --incorrect 0 --out samples/mht-cet-2025.json
```
Then check `samples/mht-cet-2025.review.txt`, fix anything flagged in the JSON, and upload it in **Admin → Upload test JSON**
(or `npm run import -- samples/mht-cet-2025.json`). Options: `--pages 1-13`, `--no-explain`, `--fresh`, `--concurrency 4`.

## Deploy to Netlify
1. Create a MongoDB Atlas cluster (free tier) and allow access from anywhere (`0.0.0.0/0`) — Netlify functions have no fixed IP.
2. New site from this repo. Build settings come from `netlify.toml`.
3. Site settings → Environment variables: `MONGODB_URI`, `JWT_SECRET`.
4. Run `npm run seed:admin` locally with `MONGODB_URI` pointing at Atlas.

## Layout
```
server/            Express API (models, routes, schema validation, scoring)
netlify/functions/ api.js — wraps the Express app for Netlify
web/               React SPA (Vite)
tools/pdf2json/    offline PDF → JSON converter (Claude vision)
scripts/           seed-admin, import-test
samples/           sample test JSON (MHT-CET 2025 Physics Q1–22)
```
