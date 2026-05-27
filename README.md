# KiteAI — X Influencer & PR Agent Demo

Real-time X influencer and PR page discovery agent. Searches X via **twitter-api45** (RapidAPI), fetches up to 10 profiles with anti-blocking delays, and scores each account across D2–D5 dimensions.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite, deployed on **Vercel** |
| Backend  | Node.js + Express, deployed on **Render** |
| X API    | [twitter-api45](https://rapidapi.com/alexanderxbx/api/twitter-api45) on RapidAPI |
| Streaming | Server-Sent Events (SSE) |

---

## Local Development

### 1. Clone & install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Set environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# → fill in RAPIDAPI_KEY in backend/.env

# Frontend
cp frontend/.env.example frontend/.env
# → VITE_BACKEND_URL=http://localhost:3001  (already set)
```

### 3. Run both servers

```bash
# Terminal 1 — backend (port 3001)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Open **http://localhost:5173**

---

## Production Deployment

### Step 1 — Push to GitHub

```bash
cd kiteai-agent-demo    # this folder
git init
git add .
git commit -m "feat: kiteai x agent demo"
# create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USER/kiteai-agent-demo.git
git push -u origin main
```

### Step 2 — Deploy Backend on Render

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install --production`
   - **Start Command:** `node server.js`
4. **Environment Variables** (in Render dashboard):

   | Key | Value |
   |-----|-------|
   | `RAPIDAPI_KEY` | your key from RapidAPI |
   | `RAPIDAPI_HOST` | `twitter-api45.p.rapidapi.com` |
   | `ALLOWED_ORIGINS` | *(fill after Vercel step — your Vercel URL)* |
   | `NODE_ENV` | `production` |

5. Deploy → copy your Render URL e.g. `https://kiteai-agent-backend.onrender.com`

### Step 3 — Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import the same GitHub repo
2. Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
3. **Environment Variables** (in Vercel dashboard):

   | Key | Value |
   |-----|-------|
   | `VITE_BACKEND_URL` | `https://kiteai-agent-backend.onrender.com` |

4. Deploy → copy your Vercel URL e.g. `https://kiteai-agent.vercel.app`

### Step 4 — Add Vercel URL to Render CORS

Go back to Render → Environment → update `ALLOWED_ORIGINS`:
```
https://kiteai-agent.vercel.app
```
Render auto-redeploys. Done.

---

## Security Notes

- `backend/.env` — **never committed** (in `.gitignore`)
- `frontend/.env` — **never committed** (in `.gitignore`)
- `.env.example` files — safe to commit, contain no real keys
- CORS restricts backend to your Vercel domain only in production
- RapidAPI key is server-side only — never exposed to the browser

---

## Scoring Dimensions

| Dimension | Weight | Source |
|-----------|--------|--------|
| D2 — Collab Evidence | 25% | Bio keywords: DM open, partnership, media kit |
| D3 — AI Content Relevance | 25% | AI/ML/voice keyword density in bio + name |
| D4 — X Authority | 20% | Blue verified + follower/following ratio |
| D5 — Reach Quality | 30% | Follower tier (Macro/Mid/Micro/Nano) |
| D1 — Engagement Rate | — | Requires timeline fetch (not in demo) |

Account types classified: **Influencer**, **PR Page**, **AI Media**, **Brand Page**
