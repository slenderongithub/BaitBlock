# State Management

There is no state management library or framework — none is needed at this scale.

## Client State

All state lives in the DOM and a handful of module-scope `const` element references in `public/script.js`:

- Input value: read directly from `articleUrlInput.value` at click/submit time — not tracked separately.
- Result data: not stored in a JS variable at all after render — `renderResult(normalizeApiResponse(data))` writes straight into the DOM and the raw `data` object is discarded. Re-rendering (e.g. a second analysis) fully overwrites the previous result; there is no diffing, no memory of prior results, no undo.
- UI mode (idle vs analyzing vs shown): implicit, driven by `analyzeBtn.disabled`/`.textContent` and `resultCard.classList` (`hidden`, `safe`/`warning`/`risky`). No formal state machine — a network error midway (e.g. thrown before `finally`) is still handled since `finally` always resets the button.

## Server State

Both backends are **fully stateless** across requests:

- No session, no cookies, no in-memory cache of prior URL analyses.
- No database — nothing is persisted anywhere in this app; the CSV files are hand-authored inputs to the offline chart pipeline, not a data store used by the servers.
- Model caches (Python `@lru_cache(maxsize=1)` on `get_nlp`/`get_sbert_model`/`get_sentiment_model`) are process-lifetime memoization of expensive model loads — not "state" in the app-data sense, just a performance optimization.

## Implication

Because nothing is cached or persisted, re-analyzing the same URL always re-fetches and re-computes from scratch — see [[Known-Issues]] and [[Improvement-Ideas]] for the cost/latency implications, especially for the Python backend's model-based path.
