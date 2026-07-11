# AI_HANDOFF.md

For any AI session picking up BaitBlock after the **v1.1.0 production-readiness upgrade** (2026-07-11).

## What This Repo Is Now

A hardened, tested, two-engine clickbait checker. Full change list: [[CHANGELOG]]. Current state + verification notes: [[CURRENT_STATE]].

## What Changed From the Original

The original was a single-commit prototype with a monolithic Node server, a broken/unreachable Python backend, an open SSRF endpoint, no tests, and two dead duplicate root files. All of that was addressed:

- Node `server.js` → split into focused modules under `src/`.
- SSRF protection, rate limiting, fetch timeout/size cap/content-type checks, Helmet CSP added.
- Python backend fixed (serves the UI now) and its embedding model upgraded to `all-mpnet-base-v2` (env-configurable).
- Frontend fully redesigned (themed dashboard, gauge, states, a11y).
- `node:test` suite (28 tests), ESLint/Prettier, GitHub Actions CI, Dependabot.

## Most Important Things To Know

1. **Both engines work now** and share the `/api/analyze` contract + the `public/` frontend. `npm start` runs Node; `./start.sh` runs Python. Each response has an `engine` field.
2. **Scoring is contract-tested.** Don't silently change weights/thresholds in `src/config.js`/`src/scoring.js` — tests guard them.
3. **Security invariants** (SSRF guard, `textContent`-only rendering, `CLICKBAIT_ALLOW_PRIVATE` off in prod) must be preserved.
4. **`cosine_similarity_score` means different things per engine** (lexical vs SBERT) — intentional, documented.

## How To Verify Changes

- Node: `npm test` (must stay 28/28), `npm run lint`, `npm run format:check`. Then `npm start` and drive a real URL.
- Python: `./start.sh` and check `/` serves the UI + `/api/analyze` works. Use `CLICKBAIT_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2` locally to avoid the large mpnet download.
- SSRF regression: confirm `http://127.0.0.1`, `http://169.254.169.254`, and `ftp://…` all return a 400.

## Recommended Next Work

See [[NEXT_SESSION]] and [[docs/Future-Roadmap]]: strategic engine unification, a real evaluation harness, result caching, and a Python-side rate limiter.

## Verification Honesty

The Python engine was exercised with the cached MiniLM model, not the mpnet default (avoided a 420 MB download). The frontend was verified via jsdom DOM assertions, not pixel screenshots (no browser in the environment). Everything else was run and observed green.
