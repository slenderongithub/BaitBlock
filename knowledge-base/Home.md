# BaitBlock Knowledge Base

Obsidian-compatible vault for the ClickbaitDetection ("BaitBlock") repository. Start here.

## Map of Content

### Architecture
- [[System-Architecture]] — full system diagram, live vs dormant backends
- [[Node-Backend]] — the live Express/Cheerio heuristic engine
- [[Python-Backend]] — the dormant Flask/NLP engine and why it's unreachable
- [[Frontend]] — the single-page UI

### Data Flow
- [[Request-Lifecycle]] — sequence diagram of a full analyze request
- [[Extraction-Fallback-Chains]] — how headline/body text is pulled from arbitrary HTML

### Features
- [[Scoring-Algorithm]] — how the 0-100 risk score is computed in both engines

### Issues
- [[Known-Issues]] — full ranked issue inventory
- [[Technical-Debt]] — duplication, dead code, structural clutter

### Reference
- [[Glossary]]
- [[File-Index]]

## Three Things to Remember

1. Two backends exist; only the Node one is reachable today. See [[Python-Backend]].
2. Root-level `script.js`/`server.js` are dead duplicates — not the real files. See [[Technical-Debt]].
3. The README's evaluation charts are illustrative sample data, not a real benchmark. See [[Known-Issues]].

## Companion Docs

Prose-form documentation (non-Obsidian) lives in `../docs/`. This vault reorganizes the same findings with cross-links and diagrams for graph-navigation-style exploration.
