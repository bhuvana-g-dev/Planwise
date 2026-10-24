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
2. Runtime: Python 3.12.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Environment variables (Dashboard → Environment):
   - `CORS_ORIGINS` = your deployed frontend origin (e.g. `https://planwise.vercel.app`)
   - `GEMINI_API_KEY` = your key (optional; omit to use the deterministic fallback)
   - `PERSISTENCE` = `firestore` (recommended for production) or `json`
   - For Firestore: `FIREBASE_PROJECT_ID` and a secret file for
     `GOOGLE_APPLICATION_CREDENTIALS` (use Render "Secret Files").

A ready-made [`render.yaml`](render.yaml) blueprint is included.

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
3. Environment variable: `VITE_API_BASE_URL` = your backend URL.
4. Deploy. (A SPA rewrite to `/index.html` is configured in
   [`frontend/vercel.json`](frontend/vercel.json).)

### Netlify

1. Base directory `frontend`, build command `npm run build`, publish `dist`.
2. Env var `VITE_API_BASE_URL`.
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
5. To enforce ownership, also set `REQUIRE_AUTH=true` and have the frontend send
   a Firebase ID token in the `Authorization: Bearer <token>` header.

---

## Post-deploy checklist

- [ ] `GET https://<backend>/health` returns `{"status":"ok", ...}`
- [ ] Frontend loads and can create an event (check the browser network tab)
- [ ] `CORS_ORIGINS` includes the exact frontend origin (scheme + host, no trailing slash)
- [ ] Secrets are set via the platform's secret manager, not committed
- [ ] If using Firestore, rules are deployed and `REQUIRE_AUTH` matches your auth setup
