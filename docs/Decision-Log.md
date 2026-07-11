# Decision Log

No commit history or documentation records actual design decisions or their rationale — the repository has a single commit (`ed48fa1`, "Initial commit: BaitBlock clickbait detection app") containing the entire codebase at once, so git history provides no decision trail. Everything below is **reconstructed from code evidence**, not sourced from the author.

## Decisions Evident From the Code

| Decision | Evidence | Inferred Rationale |
|---|---|---|
| Ship Node/Express as the live backend, not Python/Flask | `package.json` `main`/`start` point at `src/server.js`; README's Quick Start only documents `npm start` | Simpler runtime dependency (no ML libraries, no model downloads) for a demo/portfolio-style app that needs to run instantly on `npm install && npm start` |
| Build a second, more sophisticated Python NLP engine anyway | `app.py`'s far more elaborate pipeline (SBERT, spaCy NER, VADER) mirrors the Node contract field-for-field | Likely an attempt to explore/prototype a "real" NLP version, possibly for a research/academic angle (the plotting scripts and evaluation CSVs — confusion matrix, PR curves, threshold sensitivity — read like artifacts from a coursework or research write-up, not production monitoring) |
| Keep both extraction pipelines multi-tier (JSON-LD → selectors → generic fallback) in both languages | Present independently in `src/server.js` and `app.py` with different implementations of the same idea | Real-world article HTML varies enormously; a single selector strategy would fail too often. This was clearly deliberately engineered in both backends — the most mature part of either implementation |
| No authentication, no database, no persistence | Absent everywhere | Consistent with a stateless "utility tool" scope — likely intentional simplicity rather than an oversight, though the *security* gaps that fall out of it (see [[Known-Issues]]) may not have been) |
| "Neo-brutalist" visual design (thick borders, hard drop shadows, flat colors) | `public/styles.css` `--ink`/`--teal`/`--red`/`--yellow` palette, `box-shadow: Npx Npx 0 var(--ink)` throughout | Deliberate aesthetic choice, unrelated to function — consistent and well-executed across every component |

## Open Questions for the Project Owner

These can't be answered from the code alone and are worth asking directly:

1. Is `app.py` an abandoned prototype, a work-in-progress meant to replace the Node backend, or an intentional "alternate engine" option? This determines whether [[Known-Issues]] #1 is a bug to fix or dead code to remove.
2. Are `script.js`/`server.js` at the repo root leftover scratch files safe to delete, or in-progress work that shouldn't be touched?
3. Are the `fig*.png` evaluation charts meant to represent real measured performance of this specific app, or are they illustrative sample outputs (e.g., from a class assignment) bundled in for presentation? This affects whether the README needs a disclaimer or whether a real benchmark harness should be built.
