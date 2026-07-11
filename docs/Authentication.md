# Authentication

**There is none.** No login, no signup, no session/cookie handling, no API keys, no JWTs, no user model, no role/permission system in either backend.

## Implications

- `POST /api/analyze` is a fully open, unauthenticated endpoint that will make an outbound server-side HTTP request to *any* URL a caller supplies.
- There is no per-user or per-IP rate limiting, so nothing prevents high-volume abuse of the endpoint as a free URL-fetching proxy.
- Combined with the lack of a private-IP/hostname denylist, this is a textbook **SSRF (Server-Side Request Forgery)** surface — see [[Known-Issues]] for the specific risk and a suggested mitigation.

## If Auth Is Ever Added

Given the current single-file server structure, the natural insertion point is Express middleware (Node) or a `before_request` hook (Flask) in front of the `/api/analyze` route — no existing code would need to change beyond adding that middleware and, ideally, extracting the route handlers into their own modules first (see [[Coding-Conventions]]).
