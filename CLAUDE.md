# CLAUDE.md — Project Context for BaitBlock (ClickbaitDetection)

Project-level context. Complements any global `~/CLAUDE.md` tooling instructions (e.g. the `code-review-graph` MCP tools).

## What This Project Is

A web app that scores a news article URL 0–100 for clickbait / misleading / manipulative framing, across six explainable dimensions, with a five-tier verdict that names the kind of problem. As of **v2.0.0** both engines share `src/data/rules.json` (signal definitions) and `src/data/headline-model.json` (learned headline model). See [[CHANGELOG]] and `docs/`.

- **Node engine (default):** `src/` — Express + Cheerio + compromise. `scoring.js` is the six-dimension engine; `headlineModel.js` the learned classifier; plus `config`, `ssrfGuard`, `safeFetch`, `acquire`, `extraction`, `nlp`, `analyze`, `server`. Run with `npm start`.
- **Python engine (advanced):** `app.py` — a port of the same engine plus SBERT similarity and spaCy NER. Run with `./start.sh`. Checked by `.venv/bin/python -m unittest tests/test_app.py` (not in CI).
- **Frontend:** `public/` — redesigned themed (light/dark) dashboard with an animated gauge; all remote content rendered via `textContent` (never `innerHTML`).

## Ground Rules for Future Work

- Scoring is **contract-tested** (`tests/scoring.test.js`, `tests/analyze.test.js` with seven article archetypes in `tests/fixtures.js`). Change `src/scoring.js`, `src/config.js` or `src/data/rules.json` deliberately and update tests. A scoring change must be mirrored in `app.py` (constants at its top mirror `config.scoring`), then run `tests/test_app.py`.
- The headline featurizer exists twice (`headlineFeatures` in JS, `headline_features` in Python); `tests/test_app.py` checks they match. Retrain with `npm run train:headline` (corpus in `.cache/clickbait-data`).
- Both engines share the `/api/analyze` response contract; a new field must be added to `public/script.js`'s `normalizeApiResponse()` defaults too, or the UI shows blanks when the other engine (which may omit it) serves.
- Security invariants: keep the SSRF guard in front of every outbound fetch (Node: `assertUrlAllowed` + the `guardedLookup` dispatcher; Python: `safe_get` validates each redirect hop); never render remote text with `innerHTML`; keep `CLICKBAIT_ALLOW_PRIVATE` off in prod; keep the API same-origin and JSON-only.
- Run `npm test`, `npm run lint`, `npm run format:check` before considering a change done (this is what CI enforces).
- The two engines intentionally compute `cosine_similarity_score` differently (lexical vs SBERT) — don't "fix" one to match the other without a deliberate decision.

## Config

All tunables are env vars with defaults (see `.env.example` and `src/config.js`): `PORT`, `CLICKBAIT_FETCH_TIMEOUT_MS`, `CLICKBAIT_FETCH_MAX_BYTES`, `CLICKBAIT_RATE_MAX`, `CLICKBAIT_MAX_CONCURRENT`, `CLICKBAIT_HEADLESS_MAX_CONCURRENT`, `CLICKBAIT_ALLOW_PRIVATE`, `CLICKBAIT_EMBEDDING_MODEL`.

## Docs

`docs/` (topic docs incl. updated `Known-Issues.md`, `Architecture.md`), `knowledge-base/` (Obsidian vault), and the root AI-context files (`PROJECT_CONTEXT.md`, `ARCHITECTURE_CONTEXT.md`, `CURRENT_STATE.md`, `AI_HANDOFF.md`, `CHANGELOG.md`). Read `docs/Known-Issues.md` before changing security-sensitive code.
