# Deployment guide

PlanWise AI = a static React frontend + a FastAPI backend. Deploy them
separately and point the frontend at the backend's public URL.

---

## Backend (FastAPI)

The app is a standard ASGI app: `app.main:app`. Start command:

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Option A — Render

1. New → Web Service → connect the repo, root directory `backend`.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables (Dashboard → Environment):
   - **`PYTHON_VERSION` = `3.12.10`** — REQUIRED. See the pitfall below.
   - `CORS_ORIGINS` = your deployed frontend origin (e.g. `https://planwise.vercel.app`)
   - `GEMINI_API_KEY` = your key (optional; omit to use the deterministic fallback)
   - `PERSISTENCE` = `firestore` (recommended for production) or `json`
   - For Firestore: `FIREBASE_PROJECT_ID` and a secret file for
     `GOOGLE_APPLICATION_CREDENTIALS` (use Render "Secret Files").

A ready-made [`render.yaml`](render.yaml) blueprint is included.

> **Pitfall: Python version / `pydantic-core` build failure.**
> Render defaults to the latest Python (e.g. 3.14). On 3.14 there is no prebuilt
> wheel for `pydantic-core`, so pip tries to compile it from Rust and the build
> fails with *"Read-only file system"* / *"maturin failed"*. Pin Python 3.12:
> - This repo includes `backend/.python-version`, `backend/runtime.txt`, and a
>   root `.python-version`, all set to `3.12.10`.
> - If the service was created manually in the dashboard (not via `render.yaml`),
>   it ignores `render.yaml` — so also set the `PYTHON_VERSION=3.12.10`
>   environment variable in the dashboard, then **Clear build cache & deploy**.
> - Make sure the service's **Root Directory is `backend`** so Render finds
>   `requirements.txt` and `.python-version`.

### Option B — Railway / Fly.io / Azure App Service

Any Python host works. Set the same env vars and the start command above. A
[`Procfile`](backend/Procfile) is provided:

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

> The default JSON store writes to `backend/.data/`. On ephemeral filesystems
> that data is not durable across restarts — use `PERSISTENCE=firestore` in
> production.

---

## Frontend (Vite static build)

Build output is `frontend/dist`.

### Vercel

1. Import the repo, set **Root Directory** = `frontend`.
2. Framework preset: Vite. Build command `npm run build`, output `dist`.
3. Environment variables:
   - `VITE_API_BASE_URL` = your backend URL (e.g. `https://planwise-api.onrender.com`)
   - Optional auth (only if enabling Firebase sign-in): `VITE_FIREBASE_API_KEY`,
     `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
     `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
     `VITE_FIREBASE_APP_ID`. These are public web config values, not secrets.
4. Deploy. (A SPA rewrite to `/index.html` is configured in
   [`frontend/vercel.json`](frontend/vercel.json).)

### Netlify

1. Base directory `frontend`, build command `npm run build`, publish `dist`.
2. Env vars: `VITE_API_BASE_URL` (and the optional `VITE_FIREBASE_*` set above).
3. SPA redirect is handled by [`frontend/public/_redirects`](frontend/public/_redirects).

---

## Enabling Firestore (production persistence)

1. Create a Firebase project and a Firestore database (Native mode).
2. Create a service account, download the JSON key.
3. On the backend host, provide the key securely and set:
   - `PERSISTENCE=firestore`
   - `FIREBASE_PROJECT_ID=<your-project-id>`
   - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json`
4. Deploy the security rules in [`firebase/firestore.rules`](firebase/firestore.rules):
   ```
   firebase deploy --only firestore:rules
   ```
5. To enforce ownership, also set `REQUIRE_AUTH=true` and configure the frontend
   `VITE_FIREBASE_*` vars so it sends a Firebase ID token in the
   `Authorization: Bearer <token>` header.

Full step-by-step (console screenshots-level detail) is in
[`FIREBASE_SETUP.md`](FIREBASE_SETUP.md).

> **Rollout order to avoid lockout:** deploy with `REQUIRE_AUTH=false` first,
> verify the frontend sends tokens, then flip `REQUIRE_AUTH=true`. Setting it
> true before the frontend sends tokens returns 401 for every request.

---

## Post-deploy verification

Run these against the actually-deployed services (not localhost):

- [ ] `GET https://<backend>/health` returns `{"status":"ok", "gemini_enabled":..., "persistence":..., "require_auth":...}`
- [ ] Open the frontend, create an event, generate a plan — confirm it appears
- [ ] In the browser network tab: requests go to `VITE_API_BASE_URL`, and (if
      auth on) carry an `Authorization: Bearer` header
- [ ] Reduce the budget, see a proposal, approve it, refresh — the new version persists
- [ ] `CORS_ORIGINS` on the backend lists the exact frontend origin (scheme +
      host, no trailing slash) — otherwise the browser blocks requests
- [ ] No secrets committed; service-account JSON is only in the host secret store
- [ ] If Firestore: rules deployed, and `REQUIRE_AUTH` matches the frontend's auth config

> **Deployment status honesty:** I have not deployed these services to your
> Render/Vercel accounts and cannot verify a live URL from here. The above is
> the exact procedure and checklist to verify it yourself.
