# CLAUDE.md — Project Context for BaitBlock (ClickbaitDetection)

Project-level context. Complements any global `~/CLAUDE.md` tooling instructions (e.g. the `code-review-graph` MCP tools).

## What This Project Is

A web app that scores a news article URL 0–100 for clickbait/deceptive-headline risk, with an explainable breakdown. As of **v1.1.0** it is a hardened, tested, two-engine app. See [[CHANGELOG]] and `docs/`.

- **Node engine (default):** `src/` — Express + Cheerio + regex heuristics, **now modular**: `config`, `ssrfGuard`, `safeFetch`, `extraction`, `scoring`, `nlp`, `analyze`, `errors`, `textUtils`, `lexicons`, `server`. Run with `npm start`.
- **Python engine (advanced):** `app.py` — Flask + spaCy + sentence-transformers (default `all-mpnet-base-v2`) + VADER. **Now works** (the static-path bug is fixed) and shares the same frontend. Run with `./start.sh`.
- **Frontend:** `public/` — redesigned themed (light/dark) dashboard with an animated gauge; all remote content rendered via `textContent` (never `innerHTML`).

## Ground Rules for Future Work

- Node scoring behaviour is **contract-tested** (`tests/scoring.test.js`, `tests/analyze.test.js`). If you change `src/scoring.js` or `src/config.js`, update tests deliberately — a changed verdict cutoff or weight will (and should) break a test.
- Both engines share the `/api/analyze` response contract; a new field must be added to `public/script.js`'s `normalizeApiResponse()` defaults too, or the UI shows blanks when the other engine (which may omit it) serves.
- Security invariants: keep the SSRF guard in front of every outbound fetch; never render remote text with `innerHTML`; keep `CLICKBAIT_ALLOW_PRIVATE` off in prod.
- Run `npm test`, `npm run lint`, `npm run format:check` before considering a change done (this is what CI enforces).
- The two engines intentionally compute `cosine_similarity_score` differently (lexical vs SBERT) — don't "fix" one to match the other without a deliberate decision.

## Config

All tunables are env vars with defaults (see `.env.example` and `src/config.js`): `PORT`, `CLICKBAIT_FETCH_TIMEOUT_MS`, `CLICKBAIT_FETCH_MAX_BYTES`, `CLICKBAIT_RATE_MAX`, `CLICKBAIT_ALLOW_PRIVATE`, `CLICKBAIT_EMBEDDING_MODEL`.

## Docs

`docs/` (topic docs incl. updated `Known-Issues.md`, `Architecture.md`), `knowledge-base/` (Obsidian vault), and the root AI-context files (`PROJECT_CONTEXT.md`, `ARCHITECTURE_CONTEXT.md`, `CURRENT_STATE.md`, `AI_HANDOFF.md`, `CHANGELOG.md`). Read `docs/Known-Issues.md` before changing security-sensitive code.
