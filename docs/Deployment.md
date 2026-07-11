# Deployment

**No deployment configuration exists in this repository.** No Dockerfile, no `docker-compose.yml`, no Procfile, no platform-specific config (Vercel/Netlify/Render/Fly/Heroku), no CI/CD workflow files (`.github/workflows/` does not exist), no reverse-proxy config, no process manager config (pm2, systemd unit).

## How It Actually Runs Today

**Node (live):**
```bash
npm install
npm start        # runs `node src/server.js`, listens on PORT (default 3000)
```

**Python (dormant, would need fixes first — see [[Known-Issues]]):**
```powershell
./start.ps1                # Windows only; expects a pre-built .venv
./start.ps1 -Offline        # skip network calls to Hugging Face
```
There is no equivalent launcher script for macOS/Linux despite the primary repo owner apparently developing on macOS (`/Users/slender/...` paths, `.DS_Store` files present).

## What Production Deployment Would Require (not present)

- A process manager or container to keep the Node process alive and restart on crash.
- A reverse proxy / TLS termination (Express serves plain HTTP).
- Environment-specific `PORT` and (if the Python backend is ever fixed and adopted) HF cache configuration.
- Outbound network egress control given the SSRF exposure on `/api/analyze` (see [[Known-Issues]]).
- Some kind of rate limiting / WAF in front of the single public endpoint.
- A decision on which backend is authoritative — shipping both unmodified today would mean two servers competing for the same default port.

## Recommendation Surface (not applied — analysis only)

If/when deployment is scoped, the Node backend is the only one worth shipping as-is; the Python backend needs its static path fixed (`static_folder` should point at `../public`, matching `src/server.js`'s `PUBLIC_DIR` pattern) before it's deployable at all.
