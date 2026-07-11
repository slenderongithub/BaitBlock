# System Architecture

Parent: [[Home]]

## Overview

BaitBlock is a stateless static-frontend + JSON-API monolith, duplicated across two independent backend implementations. See [[Node-Backend]] and [[Python-Backend]].

```mermaid
flowchart TB
    subgraph Client["Browser"]
        UI["public/index.html<br/>public/script.js<br/>public/styles.css"]
    end

    subgraph Live["LIVE — Node/Express"]
        direction TB
        NS["src/server.js"]
    end

    subgraph Dormant["DORMANT — Python/Flask"]
        direction TB
        PS["app.py"]
    end

    UI -->|"POST /api/analyze"| NS
    NS -->|JSON| UI
    UI -.->|"would route here if static path were fixed"| PS

    NS --> TARGET1["Target article site"]
    PS --> TARGET2["Target article site"]

    style Dormant stroke-dasharray: 5 5
```

## Why Two Backends

See [[Decision-Log]] (in `../../docs/`) for the reconstructed reasoning: the Node backend is the simple, dependency-light version that's actually shipped (`package.json` points at it); the Python backend appears to be a parallel, more sophisticated NLP prototype (real embeddings, real NER, real sentiment) that was never fully wired to the frontend it was clearly built against — same JSON contract, same field names, but a broken static-file path.

## Layers

Neither backend uses MVC or a service/repository pattern. Each is a single file organized as:

```
HTTP route handlers
    → extraction functions (headline, body, metadata)
        → scoring functions (compute the 0-100 risk score)
            → small pure helpers (tokenize, clamp, normalize whitespace)
```

## Related

- [[Node-Backend]]
- [[Python-Backend]]
- [[Frontend]]
- [[Request-Lifecycle]]
