# CURRENT_STATE.md

Snapshot as of **2026-07-11**, version **1.1.0** (production-readiness upgrade applied; changes uncommitted in the working tree). See [[CHANGELOG]] for the full list.

## Git State

- Branch: `main`. Prior baseline commit: `ed48fa1`.
- This upgrade session modified tracked files (`src/server.js`, `app.py`, `package.json`, `requirements.txt`, `README.md`, `public/*`, `start.ps1` sibling) and added many new files (`src/*.js` modules, `tests/*`, `.github/*`, config files, `CHANGELOG.md`, docs). **Not yet committed** — review with `git status` / `git diff` before committing.
- Deleted the untracked duplicate root files `script.js` and `server.js`.

## What Works Right Now (verified)

- **Node engine**: `npm install && npm start` → hardened app on `:3000`. Verified: live article fetch, SSRF rejection (loopback/metadata/private/protocol) returns clean 400s, helmet headers present, malformed-JSON 400, `/healthz`.
- **Python engine**: `./start.sh` (or `python app.py`) → **now serves the UI** (previously 404'd). Verified end-to-end against a local fixture with the cached MiniLM model: `/`, `/styles.css`, `/healthz`, and a full NLP analysis (real SBERT cosine, spaCy entities). SSRF guard verified at unit level.
- **Tests**: `npm test` → **28/28 pass** (scoring, ssrf, analyze, api round-trip, jsdom frontend render). `npm run lint` and `npm run format:check` clean. `npm audit` → 0 vulnerabilities.
- **Frontend**: redesigned themed dashboard (light/dark), animated gauge, loading/error/empty states, full a11y. Verified via jsdom render tests.

## Verification Caveats

- The Python engine was run with `CLICKBAIT_EMBEDDING_MODEL=all-MiniLM-L6-v2` (already cached) to avoid a 420 MB download; the production **default is `all-mpnet-base-v2`**. The model name is just a string passed to `SentenceTransformer(...)`, so the mechanism is proven; the specific mpnet weights were not downloaded in this environment.
- No pixel screenshots were captured (no browser available in the environment); the frontend was verified functionally via jsdom DOM assertions. Run `npm start` to view it.

## What's Still Open

See [[docs/Known-Issues]] §Partially/Open: engine `cosine_similarity_score` divergence (by design), residual DNS-rebinding TOCTOU, no Python rate limiter yet, no real evaluation harness, no result caching.

## Immediate Next Steps

1. Commit the upgrade (logical groups suggested in [[CHANGELOG]]).
2. Optionally download `all-mpnet-base-v2` and run the Python engine once to warm the cache.
3. Consider the strategic engine-unification decision (see [[docs/Decision-Log]]).
