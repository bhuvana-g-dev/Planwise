# Firebase setup (Authentication + Firestore)

PlanWise AI works with **no Firebase at all** (anonymous mode + JSON store).
Follow this guide only to enable Google sign-in and/or Firestore persistence.

---

## 1. Create the project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create
   a project (this repo was configured against project id `planwise-fd015`, but
   any project works).
2. Firestore: **Build → Firestore Database → Create database** (Native mode).
3. Auth: **Build → Authentication → Get started → Sign-in method → enable
   Google**.

---

## 2. Frontend web config (public, goes in the browser)

**Project settings → General → Your apps → Web app → SDK setup and
configuration.** Copy the values into `frontend/.env`:

```
VITE_FIREBASE_API_KEY=AIza...            # public project identifier, NOT a secret
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
VITE_FIREBASE_APP_ID=1:...:web:...
```

Restart `npm run dev` after editing. A "Sign in" button appears in the header;
after signing in, the app automatically sends the Firebase ID token on every
API request.

> Add your dev and prod origins under **Authentication → Settings → Authorized
> domains** (e.g. `localhost`, your Vercel domain) or Google sign-in popups are
> blocked.

---

## 3. Backend admin credentials (SECRET — never commit)

**Project settings → Service accounts → Generate new private key.** This
downloads a JSON file. Keep it out of Git (already covered by `.gitignore`).

Set in `backend/.env` (local) or your host's secret manager (production):

```
PERSISTENCE=firestore              # to store data in Firestore
REQUIRE_AUTH=true                  # to enforce login + ownership
FIREBASE_PROJECT_ID=<project-id>
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
```

The same credential powers both Firestore access and ID-token verification
(initialized once in `app/core/firebase.py`).

---

## 4. Deploy Firestore security rules

The rules in [`firebase/firestore.rules`](firebase/firestore.rules) restrict
every document to its owner. Deploy with the Firebase CLI:

```
npm install -g firebase-tools
firebase login
firebase use <project-id>
firebase deploy --only firestore:rules
```

---

## 5. Recommended rollout order (avoid lockout)

1. Deploy backend with `REQUIRE_AUTH=false` first — confirm it works.
2. Configure the frontend `VITE_FIREBASE_*` vars and confirm sign-in works and
   tokens are sent (check the `Authorization` header in the browser network tab).
3. Only then flip the backend to `REQUIRE_AUTH=true` and redeploy.

If you set `REQUIRE_AUTH=true` before the frontend sends tokens, every request
returns `401`.

---

## 6. What is / isn't a secret

| Item | Secret? | Where it lives |
|---|---|---|
| Firebase web `apiKey` + web config | No (public identifier) | `frontend/.env`, shipped to browser |
| Admin service-account JSON | **Yes** | backend host secret store; git-ignored |
| Gemini API key | **Yes** | `backend/.env` / host secret store; backend only |

If a web `apiKey` is ever exposed somewhere you'd rather it not be, you can add
an HTTP-referrer restriction in Google Cloud Console → APIs & Services →
Credentials. It is not required for security but is good hygiene.
