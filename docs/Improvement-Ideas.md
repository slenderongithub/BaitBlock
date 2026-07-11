# Improvement Ideas

Ordered from highest-leverage/lowest-effort to longer-term. None of this has been implemented — analysis only.

## Quick Wins

1. **Decide the fate of the two backends explicitly.** Either fix `app.py`'s static path (`static_folder` → `../public`, mirroring `PUBLIC_DIR` in `src/server.js`) and document it as the "high-fidelity" opt-in engine, or remove it and keep the repo single-stack. Right now it's silently broken, which is worse than either extreme.
2. **Delete or `git add` the root-level `script.js`/`server.js`.** If they were a deliberate experiment, finish and commit it (and update `package.json`); if abandoned, remove them so nobody edits the shadow copy by mistake.
3. **Add a one-line disclaimer above the evaluation charts in `README.md`** clarifying the figures are illustrative/sample data, not a measured benchmark of the shipped engine — or replace them with a real harness (see below).
4. **Pin `requirements.txt`** (`pip freeze` from a known-good `.venv`) so the Python path is reproducible.
5. **Document the two missing Python setup steps** (`python -m spacy download en_core_web_sm`, and NLTK VADER lexicon availability) in `README.md`.
6. **Add a request timeout to the Node `fetch()` call** (`AbortController` with e.g. a 15s timeout) to match the Python backend's 20s `requests` timeout and prevent hung requests.

## Security Hardening

7. **Add an SSRF guard** before fetching: resolve the hostname, reject private/loopback/link-local ranges (RFC1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, etc.) and reject non-standard ports if not needed.
8. **Add basic rate limiting** on `/api/analyze` (e.g. `express-rate-limit` for Node, `flask-limiter` for Python) given it's an open, unauthenticated, outbound-fetch-triggering endpoint.
9. **Remove the `verify=False` SSL fallback** in `scrape_with_bs4`, or at minimum log a warning when it's used instead of silently disabling verification.

## Architecture

10. **Unify on one scoring engine.** If the Python NLP pipeline is the intended "real" version, consider having Node proxy to it (or vice versa) rather than maintaining two divergent implementations of the same product behavior — the current split guarantees the two will drift further apart over time (see [[Known-Issues]] #2).
11. **Split `src/server.js` into modules** (`extraction.js`, `scoring.js`, `routes.js`) once any new feature is added — 685 lines in one file with no exports is manageable today but is already at the point where it hides related-but-scattered logic (e.g. the noise-detection heuristics live in three separate functions).
12. **Extract magic numbers into named, documented constants** — the 0.35 similarity threshold, 0.5 sentiment threshold, and 55/40/70 score cutoffs currently live as bare literals with no comment explaining how they were chosen; a config object with a short rationale per threshold would make future tuning much safer.

## Product / Feature Gaps

13. **Build a real evaluation harness**: run the live analyzer against a labeled sample of known clickbait/legit articles, write results to the existing CSV format, and regenerate the charts from that — turning the current illustrative pipeline into an actual regression/accuracy signal you can track across changes.
14. **Add caching for repeated URL analysis** (in-memory LRU keyed by normalized URL, with a TTL) to cut latency and avoid hammering the same target site on repeat requests.
15. **Add basic automated tests**: unit tests for `computeScore`/`compute_composite` against fixed headline/body pairs (pure functions, easy to test in isolation), and a couple of integration tests that mock the outbound fetch.
16. **Add a health-check route** (`GET /healthz`) — trivial, but currently nothing distinguishes "server up, no route matched" from "server actually healthy," since the catch-all always returns 200.
17. **Handle non-HTML responses gracefully** — check `Content-Type` before parsing and return a clear 400 ("This URL doesn't appear to be an HTML article") instead of parsing arbitrary bytes as HTML.

## Developer Experience

18. **Add ESLint/Prettier for JS and black/ruff for Python**, even minimal configs, to keep the two backends' otherwise-consistent style from drifting as more contributors touch the code.
19. **Add a `macOS`/Linux equivalent of `start.ps1`** if the Python backend is kept.
20. **Add a root `README` section** (or the `Architecture.md` created in this session) explicitly explaining the two-backend situation so new contributors don't assume `app.py` is dead weight or, conversely, assume it's wired up.
