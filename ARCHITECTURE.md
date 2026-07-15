# KiteAI — Integrated Agent Platform

One login, one landing page, many agents. Users sign in once and reach every
agent (ours and our partners') through a single platform.

```
Login  →  Landing (sections)  →  Section (agents in it)  →  Agent dashboard
          Brand Visibility        e.g. PR Agents →           e.g. the X Agent
          PR Agents               [ X Agent ]                dashboard
          Leaderboard
```

The catalogue is **data-driven from one file** — [backend/agentRegistry.js](backend/agentRegistry.js).
Adding a section or an agent is a data change there; the UI needs no edits.

---

## Repo layout

```
backend/
  server.js              # app entry + the X Agent engine (scrape/score/run/cron)
  agentRegistry.js       # ★ SECTIONS + AGENTS — the single source of truth
  routes/
    auth.js              # platform — login/session
    sections.js          # platform — GET /api/sections, /api/sections/:id
    agents.js            # platform — agent details + run/status/result proxy (http agents)
    accounts|dashboard|keywords|settings|tasks.js   # X Agent data APIs
  db.js, middleware/, openrouter.js, ...

frontend/src/
  App.jsx                # routes: /login, / (landing), /section/:id, /* (X dashboard)
  context/               # shared React state (AuthContext = platform, AgentContext = X)
  components/
    platform/            # PlatformShell, AmbientCanvas, ProtectedRoute  (shared shell)
    x/                   # Sidebar + X-agent-only widgets
  pages/
    platform/            # LoginPage, LandingPage, SectionPage           (shared shell)
    x/                   # Dashboard, AgentRunner, Accounts, Keywords, ...(the X Agent UI)

agents/                  # ← partner agents — each its own service (own stack), login removed
  leaderboard/
    backend/             #   FastAPI + Turso/SQLite + Playwright (its own service)
    frontend/            #   React + Vite dashboard (embedded via iframe)
  brand-visibility/      #   (next partner agent — same pattern)
```

### Two kinds of agent

- **Native agent (the X Agent).** Same stack as the platform (Node + React), and
  the platform's original app. It lives *in* the platform — screens under
  `frontend/src/pages/x`, APIs in `backend/` — and deploys as part of the platform
  service. It is **not** under `agents/` by design.
- **Partner agents (Leaderboard, Brand Visibility).** Different stacks / separate
  repos, each a **self-contained service** under `agents/<id>/`, embedded via
  `iframe` (or driven via `http`). Their own login is removed; the platform's single
  sign-in covers them.

**Rule of thumb:** `platform/` is shared by all; `pages/x` + `backend/` is the native
X Agent; each `agents/<id>/` is one self-contained partner agent.

---

## The registry model

Two levels in [backend/agentRegistry.js](backend/agentRegistry.js):

- **`SECTIONS`** — the tiles on the landing page (`brand-visibility`, `pr`, `leaderboard`).
- **`AGENTS`** — each agent, tagged with the `sectionId` it belongs to.

A section shows as **live** when it has at least one live agent, otherwise **Coming soon**.

Each agent declares a **surface** = how the UI opens it:

| `surface` | The agent is… | UI opens it via | Use for |
|-----------|---------------|-----------------|---------|
| `app`     | a route in this React app | `path` (e.g. `/dashboard`) | our X Agent |
| `iframe`  | its own deployed dashboard | `embedUrl` | a Streamlit/Gradio agent with a good UI |
| `http`    | a headless service with a run API | gateway proxies `runUrl` | a Python service we drive + render here |

---

## Adding an agent (the recipe)

### 1. Partner agent that is a **Python service** (most common)

Their agent stays **Python, in its own service** — we do **not** rewrite it in Node.

1. **Strip its login.** Partner repos ship their own auth screen. Remove it — the
   platform's single login (before the landing page) already covers every agent.
   The agent should assume the caller is already authenticated.
2. **Pick the surface:**
   - It has a dashboard UI (Streamlit, etc.) → **`iframe`**. Make it embeddable
     (Streamlit: append `?embed=true`; ensure it doesn't send `X-Frame-Options: DENY`).
   - It's an API (FastAPI/Flask) → **`http`**. Expose `POST /run` → `{jobId}`,
     `GET /status/:id`, `GET /result/:id`. Our gateway ([routes/agents.js](backend/routes/agents.js)) forwards to it.
3. **Add one registry entry** with its `sectionId`, `status: 'live'`, the surface,
   and the URL behind an **env var** (so local ≠ prod):
   ```js
   { id: 'leaderboard', sectionId: 'leaderboard', name: 'Leaderboard Agent',
     icon: '△', status: 'live', surface: 'iframe',
     embedUrl: process.env.LEADERBOARD_URL, description: '…', version: 1 }
   ```
4. Done. It appears in its section automatically, and the section flips to live.

### 2. An agent built **in this app** (like the X Agent)

Add pages under `frontend/src/pages/<id>/`, its APIs under `backend/routes/`,
and a registry entry with `surface: 'app'` + `path`.

---

## Integration rules for partner code

- **Remove their login / signup.** Single platform login only.
- **Keep their dashboard** — that's the agent. It opens from its section card.
- **Don't copy their Python into `backend/`.** Keep it a service under `agents/<id>/`
  (or their own repo) and point the registry at it by URL.
- **No secondary sign-in inside an agent.** If the agent needs the user identity,
  the platform passes it (JWT / header) — the agent trusts the gateway.

---

## Deployment (Railway)

One Railway **project**, multiple **services**:

| Service | Root dir | Start | Env it needs |
|---------|----------|-------|--------------|
| `platform` | repo root | `node backend/server.js` (serves built `frontend/`) | `LEADERBOARD_URL` = the leaderboard-web public URL; plus the platform's own secrets |
| `leaderboard-api` | `agents/leaderboard/backend` | `uvicorn main:app --host 0.0.0.0 --port $PORT` (build installs deps + `playwright install chromium`) | `TURSO_URL`, `TURSO_AUTH_TOKEN`, `OPENROUTER_API_KEY`, `JWT_SECRET`, `APP_USERNAME`, `APP_PASSWORD` |
| `leaderboard-web` | `agents/leaderboard/frontend` | build with `npm ci && vite build`, serve `dist/` | `VITE_API_URL` = the leaderboard-api public URL |

Flow: users hit the **platform** public URL, sign in once, open the Leaderboard
section → the platform embeds **leaderboard-web** (`LEADERBOARD_URL`), which calls
**leaderboard-api** (`VITE_API_URL`). Secrets live only in each service's Railway
env — never in git (`.env` is ignored). Adding **brand-visibility** later repeats
this: two services + a `BRAND_VISIBILITY_URL` on the platform + one registry entry.

> Local dev mirrors this: platform `:5173`/`:3001`, leaderboard-web `:5175`,
> leaderboard-api `:8000`, with `LEADERBOARD_URL=http://localhost:5175`.
