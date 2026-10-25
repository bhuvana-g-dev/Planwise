# PlanWise AI — Adaptive Event Planning Assistant

PlanWise AI helps people plan **birthdays, weddings and community events**
within a fixed budget and personal constraints. Its standout capability is a
reliable, explainable **Adaptive Budget & Change-Impact Engine**: when you
change the budget, guest count, date or preferences, PlanWise analyzes the
existing plan, proposes a targeted revision, and shows a before/after report —
without blindly rebuilding everything.

> All costs shown are **illustrative estimates**, never verified vendor
> quotations. Vendor prices and availability come only from data you enter.

---

## Why it's different

- **The AI never does the math.** Every rupee figure is computed in Python from
  integer **paise**, re-validated on the server, and re-validated again before
  any proposal is saved. Gemini only contributes narrative content
  (recommendations, risks, vendor questions).
- **Change-impact, not chat.** Each change yields a structured diff: affected
  categories, added/modified/removed expenses, shifted/overdue deadlines,
  preserved hard constraints, trade-offs, and reasons.
- **Approve before it sticks.** Proposals are never auto-applied. Rejecting
  leaves the current plan untouched. Approval uses **optimistic concurrency** —
  a stale proposal can't overwrite a newer approved plan (HTTP 409).
- **Runs with zero secrets.** No Gemini key? A deterministic generator stands in
  (clearly labelled). No Firebase? A file-backed JSON store persists everything.

---

## Architecture

```
planwise-ai/
  backend/            FastAPI + Pydantic, deterministic engines, repositories
    app/
      api/            routes + auth dependency
      core/           config, money (paise) helpers
      models/         Pydantic domain models
      services/       budget, timeline, change-impact, plan generation, gemini
      repositories/   JSON (default) + Firestore implementations
      main.py
    tests/            pytest (23 tests, all 18 required scenarios)
    scripts/e2e_check.py
  frontend/           React + Vite + TS + Tailwind + React Router
    src/
      components/ pages/ layouts/ hooks/ services/ types/ utils/ test/
  firebase/           Firestore security rules
  README.md  .env.example  .gitignore
```

**Data flow (plan generation):** validate input → (Gemini for narrative, with
fallback) → build deterministic expenses → recompute budget in Python →
validate arithmetic → validate hard constraints → persist → return.

**Data flow (replanning):** load active plan → deterministic change handler
(budget rebalance / guest scaling / deadline shift / preference reweight) →
recompute + validate → return proposal **only** (not saved) → user approves →
concurrency check → recompute once more → save as new version.

---

## Prerequisites

- Node.js 18+ (tested on v24)
- Python 3.11+ (tested on 3.12)

---

## Run locally

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy ..\.env.example .env          # optional; defaults work with no edits
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Health: http://localhost:8000/health
- Interactive docs: http://localhost:8000/docs

### 2. Frontend

```powershell
cd frontend
npm install
copy .env.example .env             # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

- App: http://localhost:5173

> On Windows PowerShell, if `npm` is blocked by execution policy, run npm via
> `cmd /c "npm install"` or set `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

---

## Environment variables

See [`.env.example`](.env.example). Backend reads `backend/.env`; frontend reads
`frontend/.env`.

| Variable | Where | Default | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | backend | _(empty)_ | Empty → deterministic fallback generator |
| `GEMINI_MODEL` | backend | `gemini-1.5-flash` | |
| `AI_TIMEOUT_SECONDS` | backend | `30` | |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated |
| `PERSISTENCE` | backend | `json` | `json` or `firestore` |
| `FIREBASE_PROJECT_ID` | backend | _(empty)_ | Firestore only |
| `GOOGLE_APPLICATION_CREDENTIALS` | backend | _(empty)_ | Path to service account JSON (never commit) |
| `REQUIRE_AUTH` | backend | `false` | `true` enforces Firebase ID tokens + ownership |
| `VITE_API_BASE_URL` | frontend | `http://localhost:8000` | Production API URL |
| `VITE_FIREBASE_*` | frontend | _(empty)_ | 6 Firebase web config values; empty → anonymous mode |

Enabling Gemini, Firestore or Auth requires **no code changes** — just set the vars.

---

## Authentication (optional Firebase Auth)

Auth is **fully implemented and off by default** so the app runs with zero
config. Enable it by setting the Firebase env vars on both sides.

- **Frontend**: set the 6 `VITE_FIREBASE_*` vars. A Google sign-in / sign-out
  control appears in the header. On sign-in the app automatically attaches the
  Firebase **ID token** as `Authorization: Bearer <token>` on every API call.
  With the vars empty, the app stays in anonymous mode and sends no token.
- **Backend**: set `REQUIRE_AUTH=true` plus Firebase Admin credentials
  (`GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`). FastAPI then
  verifies every token, derives the `uid`, stamps it as the event `owner_id`,
  and **enforces ownership on every private endpoint** (get/list/plan/replan/
  approve/task/vendor). Missing/empty token → `401`; another user's event →
  `403`; expired/invalid token → `401` (no internal details leaked).

> **Order matters:** do NOT set `REQUIRE_AUTH=true` in production until the
> frontend is configured with the `VITE_FIREBASE_*` vars and actually sends
> tokens — otherwise all requests get 401. See `FIREBASE_SETUP.md`.

The Firebase web `apiKey` is a public project identifier (safe in the browser),
**not** a secret. The real protections are the backend token verification and
the Firestore security rules in `firebase/firestore.rules`. The Admin
service-account JSON **is** a secret and is git-ignored.

---

## Testing

### Backend (38 tests — 18 required scenarios + auth + concurrency + guests)

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q
```

### Live end-to-end smoke test (server must be running on :8000)

```powershell
cd backend
.venv\Scripts\python.exe scripts\e2e_check.py
```

This reproduces the demo: create → plan → reduce ₹30,000 → ₹24,000 → approve →
stale-approval blocked (409) → reload shows v2 persisted.

### Frontend (11 tests)

```powershell
cd frontend
npm test          # vitest
npm run build     # type-check + production build
```

Tests mock Firebase and external services — no credentials needed to run the
suite.

### Required test scenarios → where they live

| # | Scenario | Test |
|---|---|---|
| 1 | Create a valid event | `test_api.py::test_create_valid_event` |
| 2 | Reject invalid event data | `test_api.py::test_reject_invalid_event` |
| 3 | Budget totals correct | `test_budget_engine.py::test_budget_totals_correct` |
| 4 | Detect over-budget | `test_budget_engine.py::test_detect_over_budget` |
| 5 | Preserve non-negotiables | `test_budget_engine.py::test_savings_ranking_...` |
| 6 | Replan after budget decrease | `test_change_engine.py::test_replan_budget_decrease` |
| 7 | Recalculate guest-dependent costs | `test_change_engine.py::test_guest_count_increase_...` |
| 8 | Recalculate deadlines on date change | `test_change_engine.py::test_date_change_...` |
| 9 | Detect dependency conflicts | `test_change_engine.py::test_dependency_conflict_detected` |
| 10 | Reject malformed Gemini response | `test_gemini.py::test_malformed_gemini_falls_back` |
| 11 | Handle Gemini timeout/failure | `test_gemini.py::test_gemini_timeout_falls_back` |
| 12 | Reject invalid arithmetic | `test_budget_engine.py::test_reject_invalid_arithmetic` |
| 13 | Require approval to apply revision | `test_api.py::test_approve_and_stale_rejection` |
| 14 | Preserve plan after rejection | `test_api.py::test_reject_leaves_plan_intact` |
| 15 | Prevent stale approval | `test_api.py::test_approve_and_stale_rejection` |
| 16 | Reload persisted event | `test_api.py::test_reload_persisted_event` |
| 17 | Enforce ownership (auth) | `test_auth_ownership.py` (7 tests: cross-user 403, scoped list, private-op enforcement, 401 handling, uid stamping) |
| 18 | Dashboard reflects saved data | `test_api.py::test_dashboard_reflects_saved_...` |
| + | Concurrent approvals are safe | `test_concurrency.py` (atomic CAS, only one approval wins, reject leaves plan intact) |

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/events/{id}/guests` | List guests + deterministic RSVP summary |
| PUT | `/api/events/{id}/guests` | Replace guest list (ids assigned, summary recomputed) |
| POST | `/api/events` | Create an event |
| GET | `/api/events` | List events |
| GET | `/api/events/{id}` | Event + active plan + versions + vendors |
| POST | `/api/events/{id}/plans` | Generate initial plan |
| GET | `/api/events/{id}/plans` | List plan versions |
| POST | `/api/events/{id}/replans` | Propose a revision (not saved) |
| POST | `/api/events/{id}/plans/approve` | Approve a proposal (concurrency-checked) |
| PATCH | `/api/events/{id}/tasks/{task_id}` | Update a task |
| POST | `/api/events/{id}/vendors/compare` | Compare vendor quotes |
| GET | `/api/events/{id}/vendors` | List saved vendor quotes |

---

## Security

- Gemini key lives only on the backend; it's never shipped to the browser.
- Secrets load from env; service-account JSON is git-ignored.
- Client-supplied totals are never trusted — the budget is recomputed server-side.
- Ownership is enforced on every private operation when `REQUIRE_AUTH=true`.
- Firestore rules restrict reads/writes to the owner (see `firebase/firestore.rules`).
- Approval is protected against stale versions via optimistic concurrency.
- Replanning is bounded (no infinite loops); infeasible changes return an
  explicit report.

---

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for step-by-step instructions (Vercel/Netlify
for the frontend, Render/Railway/Fly for the FastAPI backend, and switching the
store to Firestore).

## AI / Gemini

See [`docs/AI_PROMPTS.md`](docs/AI_PROMPTS.md) for prompt iterations and the
precise role Gemini plays (and does not play).
