# SYSTEM_OVERVIEW.md

> **Updated for v1.1.0.** The "one only works / two decoy root files / illustrative charts" notes below are partly superseded: **both engines now work**, the duplicate root files were **deleted**, and the charts now carry a disclaimer. The app is hardened + tested. See [[CHANGELOG]].

One-page mental model for a new AI session or new contributor.

## The App in One Sentence

Paste a news URL → server fetches and parses it → heuristic/NLP scoring compares headline against body and scans for clickbait phrasing → browser shows a color-coded risk verdict with an explainable breakdown.

## The System in One Diagram

```mermaid
flowchart TB
    subgraph Client
        UI[public/index.html + script.js + styles.css]
    end
    subgraph LiveServer["Live — Node/Express (src/server.js)"]
        R1[POST /api/analyze]
        R2[extraction functions]
        R3[computeScore]
    end
    subgraph DormantServer["Dormant — Python/Flask (app.py)"]
        P1[POST /api/analyze]
        P2[scrape_article + spaCy/SBERT/VADER]
        P3[compute_composite]
        P4["/ route — BROKEN static path"]
    end
    subgraph SideProject["Disconnected — evaluation charts"]
        CSV[hand-authored CSVs]
        PLOT[plot_*.py]
        FIG[fig*.png in README]
    end

    UI -->|works today| R1 --> R2 --> R3 --> UI
    UI -.->|would need static-path fix| P4
    P1 --> P2 --> P3
    CSV --> PLOT --> FIG
```

## The Three Things to Never Forget About This Repo

1. **Two backends, one frontend, one only actually works.** Node/Express is live; Python/Flask is dormant due to a broken static-file path.
2. **Two root-level files are decoys.** `script.js` and `server.js` at repo root are untracked dead duplicates of the real `public/script.js` and `src/server.js`.
3. **The README's evaluation charts are illustrative, not measured.** They come from small hand-authored CSVs, not from running this app against real data.

## Full Reference

`docs/` (20 files) and `knowledge-base/` (Obsidian vault with diagrams) contain the complete analysis this summary is drawn from.
