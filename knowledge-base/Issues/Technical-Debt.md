# Technical Debt

Parent: [[Home]]

## Duplication

- Root-level `script.js` (byte-identical to `public/script.js`) and `server.js` (near-identical to `src/server.js`, differs only in static-directory resolution) — untracked, unreferenced by any config, pure landmine risk for future editors. See [[Node-Backend]].
- [[Node-Backend]] and [[Python-Backend]] independently reimplement the entire scoring/extraction pipeline with no shared code, and have already drifted (different verdict cutoffs, different similarity semantics — see [[Scoring-Algorithm]]).

## Dead Code

- `toSentenceCase()` in `src/server.js` — defined, never called.

## Structural Clutter

- Repo root holds 30+ files with no folder boundary between "the live JS app," "the dormant Python NLP experiment," and "the offline chart-generation side-project." A `python/` or `research/` subfolder would make the boundary explicit.
- No `tests/`, no CI config, no lint config anywhere.

## Naming Inconsistency

- Node's JSON API mixes `snake_case` (`composite_sensationalism_score`) and `camelCase` (`isLikelyClickbait`) in the same response object.

## Disconnected Pipeline

- `plot_*.py` + CSVs + `fig*.png` form a self-contained reporting pipeline with no code path connecting it to either live backend — nothing regenerates these charts from actual app output. Presented in the README next to the live app without a disclaimer, this reads as a real benchmark when it's illustrative sample data.

## Related

- [[Known-Issues]]
- `../../docs/Improvement-Ideas.md` for suggested remediation, ordered by effort.
