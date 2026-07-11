# PROJECT_CONTEXT.md

> **Updated for v1.1.0 (2026-07-11).** Key facts below changed: **both backends now work** (the Python static-path bug is fixed), the Node backend is **modular** (not a single file), and the app is now **hardened + tested** (SSRF protection, rate limiting, Helmet, 28-test `node:test` suite, CI). The frontend is a **redesigned themed dashboard**. See [[CHANGELOG]] and [[CURRENT_STATE]] for the authoritative current state; treat any "only Node works / single file / no tests" statements below as pre-upgrade history.

## Purpose

BaitBlock: paste a news article URL, get a 0-100 clickbait/deceptive-framing risk score with an explainable signal breakdown. Not a fact-checker — flags framing risk, not factual accuracy.

## Architecture Summary

Stateless single-page app + JSON API, no database, no auth, no persistence. Two independent backend implementations exist against one shared contract and one shared frontend:

- **Node/Express** (`src/server.js`) — live, regex/heuristic scoring, no ML deps. This is what `npm start` runs.
- **Python/Flask** (`app.py`) — dormant, real NLP (spaCy NER, SBERT embeddings, VADER sentiment), but its static file serving is broken (points at repo root instead of `public/`), so it can't currently serve the UI.

Full detail: `docs/Architecture.md`, `docs/Data-Flow.md`.

## Current Implementation State

- Node backend: fully functional, matches README's documented Quick Start.
- Python backend: functionally complete internally (`analyze_article()` works if called directly) but unreachable via HTTP due to the static path bug.
- Frontend: single static page (`public/index.html` + `script.js` + `styles.css`), defensively normalizes either backend's response shape.
- Evaluation/reporting: seven `plot_*.py` scripts turn small hand-authored CSVs into the charts shown in `README.md` — this is a disconnected side pipeline, not live telemetry.

## Known Bugs / Limitations

See `docs/Known-Issues.md` for the full ranked list. Top three:
1. Python backend can't serve `index.html` (broken static path).
2. `/api/analyze` has no SSRF protection, no rate limiting, no auth — open outbound-fetch endpoint.
3. Node and Python backends compute `cosine_similarity_score` completely differently (lexical overlap vs. real embedding similarity) despite sharing the field name and 0.35 threshold.

## Important Files

| File | Role |
|---|---|
| `src/server.js` | Entire live backend: extraction, scoring, routing (685 lines, one file) |
| `public/script.js` | Entire frontend logic (250 lines, one file) |
| `public/index.html` | The only page |
| `public/styles.css` | "Neo-brutalist" theme |
| `app.py` | Dormant Python NLP backend (471 lines) |
| `package.json` | `main`/`start` → `src/server.js` |
| `requirements.txt` | Unpinned Python deps for `app.py` |

## Tech Stack

Node.js, Express, Cheerio, vanilla HTML/CSS/JS (live). Python, Flask, spaCy, sentence-transformers, NLTK, TextBlob, newspaper3k, BeautifulSoup4 (dormant). No framework, no bundler, no database, no test runner, no CI. Full detail: `docs/Tech-Stack.md`.

## How to Run

```bash
npm install && npm start
```
Opens on `http://localhost:3000`. See `docs/Developer-Onboarding.md` for the Python path (requires manual fixes first).

## Deployment

None configured — no Dockerfile, no CI, no platform config. See `docs/Deployment.md`.

## Future Goals

Inferred only, not stated by the project owner — see `docs/Future-Roadmap.md` and the open questions in `docs/Decision-Log.md`.

## Important Assumptions Made During This Analysis

- The Node backend is authoritative/live because `package.json` points at it and the README documents only that path.
- The root-level `script.js`/`server.js` are abandoned experiments, not in-progress work, based on being untracked and unreferenced — **confirm with the project owner before deleting them.**
- The evaluation CSVs are hand-authored sample data, not generated output, based on their small size and the absence of any generating script.

## Things to Avoid

- Don't edit the root-level `script.js`/`server.js` thinking they're the live files.
- Don't assume `app.py` works without first fixing its static path.
- Don't cite the `fig*.png` charts as real accuracy numbers for the shipped engine without checking with the owner first.

## Pending Work / Priority Areas

See `docs/Improvement-Ideas.md`, ordered by effort. Highest priority: decide the two-backend situation, then close the SSRF gap before any public deployment.
