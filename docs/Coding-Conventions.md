# Coding Conventions (as observed)

No linter, formatter, or style guide config exists (no `.eslintrc`, `.prettierrc`, `pyproject.toml` tool config, `flake8`/`black` config). Conventions below are inferred purely from reading the code.

## JavaScript (`src/server.js`, `public/script.js`)

- 2-space indentation, double-quoted strings, semicolons used consistently.
- `const`/function declarations only — no `var`, minimal `let` (only for accumulators like `score`).
- Function names are verb-first and descriptive (`extractBodyText`, `computeLexicalSimilarity`, `pruneNoisyDom`).
- Regex constant tables (`BAIT_PATTERNS`, `DECEPTION_HINTS`) are declared at module scope in `SCREAMING_SNAKE_CASE`; helper sets (`STOP_WORDS`, `POSITIVE_WORDS`, `NEGATIVE_WORDS`) follow the same pattern.
- No JSDoc, no inline comments except two (`// Ignore malformed JSON-LD blocks.` and one in the frontend) — the code favors self-explanatory names over comments, consistent with a "comment only the non-obvious" ethos, though a few of the scoring heuristics' *thresholds* (0.35 similarity gap, 0.5 sentiment magnitude, 55/40/70 score cutoffs) would benefit from a one-line rationale since they're not derivable from the code itself.
- Everything is one flat file per backend — no module boundaries, no `exports`.

## Python (`app.py`)

- 4-space indentation, double-quoted strings, type hints used on most function signatures (`Dict`, `List`, `Tuple` from `typing`, plus `str | None`).
- `@lru_cache(maxsize=1)` used consistently as the "load once" pattern for expensive model objects.
- Broad `except Exception` blocks are used defensively around optional/fallback paths (e.g. `get_sbert_model`, `scrape_article`) — consistent, deliberate fallback-oriented error handling rather than accidental over-catching.
- Docstrings are absent; naming carries the same self-documenting weight as the JS side (`semantic_similarity`, `headline_sentiment`, `lexical_hook_score`).

## HTML/CSS (`public/`)

- Tab-indented HTML, semantic-ish element choices (`main`, `section`, `article`, `aria-live` on the result card).
- CSS uses custom properties (`:root { --bg; --ink; --teal; ... }`) for the "neo-brutalist" theme (thick borders, hard drop shadows, no border-radius softening on cards).
- BEM-ish but not strict class naming (`.brutal-card`, `.tag-chip.is-signal`, `.result-card.risky`) — modifier classes via `.is-*` suffixes and state classes appended directly to base component classes.
- One responsive breakpoint (`@media (max-width: 740px)`), mobile-first is **not** used (base styles are desktop-oriented, then overridden down).

## Naming Inconsistencies Observed

- Response field naming mixes `snake_case` (`composite_sensationalism_score`, `body_snippet`) and `camelCase` (`isLikelyClickbait`) within the same Node JSON response — the Python backend does not emit `isLikelyClickbait` or `bucket` at all, so this camelCase field is a Node-only outlier. See [[Known-Issues]].
- `toSentenceCase()` is defined in `src/server.js` but never called anywhere — dead code.
