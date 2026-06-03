import { useState } from 'react';

const SECTIONS = [
  {
    id: 'agent-run',
    label: 'Agent Run & Discovery',
    color: '#1D9BF0',
    description: 'How the agent searches X and discovers accounts',
    prompts: [
      {
        title: 'Keyword Search Strategy',
        context: 'Building the search approach — compound OR queries instead of individual keywords',
        prompt: `We have 358 keywords (61 own + 297 from friend DB). Instead of 358 separate API calls, group them into compound OR queries:
"vapi OR elevenlabs OR deepgram OR retell ai" = 1 call instead of 4.
This frees ~270 request slots for profile fetches.
Also: shuffle query order each run, vary count 40-50 (not always 50), paginate with cursor for top queries.
Weekly rotation: run only 1/4 of keywords per week (indices % 4 === weekSlot).
Cross-query frequency: handles appearing in 3+ different keyword searches get fetched first.`,
      },
      {
        title: 'Profile Validation — Minimum Bar',
        context: 'Filtering out invalid/bot/empty accounts before scoring',
        prompt: `After fetching each profile, apply these checks BEFORE any scoring:
1. followers < 100 → DISCARD (bot/new account)
2. tweets < 1 → DISCARD (never posted)
3. name is empty → DISCARD (suspended account)
4. followers < 500 AND bio is empty → DISCARD (no signal)
5. After keyword scoring: overall < 10 → DISCARD (zero relevance)
This prevents wasting AI quota on junk accounts.`,
      },
      {
        title: 'Rate Limiter — Anti-Bot Strategy',
        context: 'Protecting the paid API key from blocks',
        prompt: `Paid key: 3 RPM (twitter241). Anti-bot measures:
1. Proactive pacing: calculate earliest safe fire time BEFORE each request
2. Jitter: ±3,000ms random spread (not mechanical 20s intervals)
3. Human breaks: 30-60s pause every 20-35 requests
4. Query shuffle: different order each run
5. Count variation: 40-50 per search (never always 50)
6. Skip recent: accounts updated <6 days ago skipped
7. SSE keepalive: ping every 5s during waits (Render timeout prevention)`,
      },
    ],
  },
  {
    id: 'scoring',
    label: 'Scoring System (D2–D5)',
    color: '#00C896',
    description: 'How each account is scored across 4 dimensions',
    prompts: [
      {
        title: 'D4 — Authority Score (algorithmic)',
        context: 'Calculating credibility from raw numbers, no API call',
        prompt: `D4 = min(95, verified_bonus + ratio_bonus + follower_bonus)
verified_bonus: +30 if blue_verified
ratio_bonus: +35 if followers/following ≥ 30x | +22 if ≥10x | +12 if ≥3x
follower_bonus: +30 if ≥100K | +20 if ≥10K | +10 if ≥1K
Why ratio matters: high ratio = organic growth, not follow-back spam.`,
      },
      {
        title: 'D5 — Reach Quality (algorithmic)',
        context: 'Tier classification based on follower count',
        prompt: `D5 = follower tier score (most heavily weighted at 30%):
≥500K = Macro → 95
≥100K = Mid-Tier → 80
≥10K  = Micro → 60
≥1K   = Nano → 40
≥500  = Low → 25
<500  = Very Low → 10`,
      },
      {
        title: 'D2 + D3 — AI Scoring Prompt (Claude Opus 4.5)',
        context: 'The batch prompt sent to Claude for 6 accounts at a time',
        prompt: `KiteAI — voice AI company. Score these X accounts for influencer/PR outreach.

D2 Collab Intent (0-100):
  90+: DM open/media kit/email in bio
  65-89: website/biz inquiries
  35-64: personal no signals
  10-34: news/corp brand
  0-9: bot/spam

D3 AI Relevance (0-100):
  90+: voice AI/LLM/Vapi/ElevenLabs builder
  65-89: AI founder/SaaS/creator
  35-64: general tech
  10-34: adjacent
  0-9: none

type: "Influencer" | "PR Page" | "AI Media" | "Brand Page" | "Account"
track: "A"=collab pipeline | "B"=ads audience only

PROMOTION DETECTION:
promotion_type: "explicit"|"inferred"|"none"|"unknown"
  explicit = bio says paid work: DM for sponsorships, media kit, UGC creator
  inferred = profile PATTERN suggests paid: lifestyle creator, reviewer, multiple brand signals
promotion_confidence: 0-100
promotion_signals: array of 3 detected signals

Return ONLY JSON array, same order as input.`,
      },
      {
        title: 'Final Score Formula',
        context: 'Combining all 4 dimensions into overall score',
        prompt: `Overall = D2 × 0.25  +  D3 × 0.25  +  D4 × 0.20  +  D5 × 0.30

D2 and D3 come from Claude AI (reads bio + name).
D4 and D5 are algorithmic (from raw follower numbers).

Track enforcement (overrides AI):
  if type is "PR Page" OR "Brand Page" → track = "B" always
  else → track = "A"
This prevents inconsistencies like AI saying "PR Page" but track "A".`,
      },
    ],
  },
  {
    id: 'promotion',
    label: 'Track A1/A2 Classification',
    color: '#F9A825',
    description: 'Detecting which accounts are available for paid collab',
    prompts: [
      {
        title: 'Core Classification Logic',
        context: 'The key insight: ambassador ≠ available for our collab',
        prompt: `The key question: is this account AVAILABLE for paid collaborations with KiteAI?

A1 (confirmed available):
- "DM for collabs", "DM for paid promo", "open to brand deals"
- "media kit", "UGC creator", "content creator for hire"
- collab@email, partnerships@email
- #ad or #sponsored in bio

NOT A1 (single-brand exclusive):
- "Ambassador @brand" → works for one brand only, not available for us
- "Official X ambassador" → brand exclusive
- "Brand ambassador for Y" → employed by that brand

A2 (inferred from tweets):
- #ad, #sponsored, #gifted in tweets
- Discount codes ("use code X")
- "I partnered with [Brand]", "gifted by [Brand]"
- Multiple different brand reviews with CTAs`,
      },
      {
        title: 'Tweet Analysis Prompt (Claude)',
        context: 'Sent when bio analysis is inconclusive — fetches from:username tweets',
        prompt: `Is @{handle} AVAILABLE for paid brand collaborations with new brands?

Bio: "{bio}"

Recent tweets:
{tweet1}
{tweet2}
...{tweet10}

KEY QUESTION: Does this account actively do paid promotions with MULTIPLE brands?
NOT what we want: accounts that exclusively represent one brand (official ambassadors).

Explicit: #ad, #sponsored, #gifted, discount codes, "I partnered with [Brand]",
  "Thank you [Brand] for sending", product reviews + CTA
Inferred: Review-style posts about multiple DIFFERENT brands, unboxing,
  giveaways with brands, "link in bio" + brand, affiliate patterns

Return ONLY JSON: {"promotion_type":"explicit"|"inferred"|"none","confidence":0-100,"signals":["..."]}`,
      },
    ],
  },
  {
    id: 'database',
    label: 'Database & Storage',
    color: '#C084FC',
    description: 'Schema design and data persistence strategy',
    prompts: [
      {
        title: 'Database Schema Design',
        context: 'Designing the Turso/libSQL schema for the agent',
        prompt: `Design a database schema for storing X influencer/PR page profiles with:
- Unique constraint on handle (X username)
- All scoring dimensions (d1-d5, overall)
- Track A/B classification
- Promotion type (A1/A2 detection)
- Contact info (email, DM status)
- Run history tracking
- Keyword management
- Agent config (cron settings, quotas)

Tables needed: accounts, keywords, runs, users, agent_config
Key decisions: UPSERT for dedup, JSON for arrays (promotion_signals),
INTEGER 0/1 for booleans (Turso doesn't have BOOL).`,
      },
      {
        title: 'Deduplication Strategy',
        context: 'Ensuring no account appears twice',
        prompt: `Two-layer deduplication:
1. seenThisRun Set (in-memory): track all handles seen in this run.
   If same handle appears in "voice ai" AND "vapi developer" searches → fetch only once.
2. DB UNIQUE constraint on handle column.
   Every write is an UPSERT: INSERT OR UPDATE.
   Same handle never creates duplicate rows.
3. Weekly skip optimisation: handles updated <6 days ago → skip re-fetching.
   Saves API quota on weekly re-runs where DB already has most accounts.`,
      },
    ],
  },
  {
    id: 'api-integration',
    label: 'API Integration (twitter241)',
    color: '#1D9BF0',
    description: 'How we use the twitter241 RapidAPI',
    prompts: [
      {
        title: 'twitter241 Response Parsing',
        context: 'Extracting data from the deeply nested twitter241 JSON',
        prompt: `twitter241 returns deeply nested JSON (different from twitter-api45).

Search response path:
  data.result.timeline.instructions
  → find { type: "TimelineAddEntries" }
  → .entries[].content.itemContent.tweet_results.result.core.user_results.result.core.screen_name

Profile response path:
  data.result.data.user.result.core.name (display name)
  data.result.data.user.result.core.screen_name (handle)
  data.result.data.user.result.legacy.description (bio)
  data.result.data.user.result.legacy.followers_count
  data.result.data.user.result.legacy.friends_count (following)
  data.result.data.user.result.is_blue_verified
  data.result.data.user.result.avatar.image_url`,
      },
      {
        title: 'Compound OR Search Queries',
        context: 'Maximising accounts discovered per API call',
        prompt: `Instead of searching each keyword separately (358 calls):
Group into compound OR queries:
  "vapi OR elevenlabs OR deepgram OR retell ai" = 1 call, returns any of these

Benefits:
- 358 searches → ~90 compound queries (4 per group)
- Frees ~268 API slots for profile fetches
- Gets broader results (accounts mentioning any of the terms)

Pagination: each search returns a cursor.bottom for next page.
Use it to get 2× handles from top-performing queries.`,
      },
    ],
  },
  {
    id: 'security',
    label: 'Security & Auth',
    color: '#FF4444',
    description: 'Authentication, key protection, and security measures',
    prompts: [
      {
        title: 'JWT Authentication System',
        context: 'Stateless auth across Render/Vercel split deployment',
        prompt: `Use JWT for stateless authentication (no sessions needed):
- 7-day token expiry
- Bearer token in Authorization header for all API calls
- Special: SSE/EventSource cannot send headers → pass via _token query param
- Admin user created from ADMIN_EMAIL/ADMIN_PASSWORD env vars on startup
- Registration endpoint disabled (returns 403) — only env-var seeded admin
- bcrypt-12 for password hashing
- JWT_SECRET must be set or server throws at startup

Security headers: Helmet.js, trust proxy for Render, CORS restricted to
ALLOWED_ORIGINS + *.vercel.app preview deployments.`,
      },
      {
        title: 'API Key Protection',
        context: 'Ensuring keys never reach the frontend',
        prompt: `All API keys (RapidAPI, OpenRouter, Turso, JWT) stored in backend/.env ONLY.
Frontend never sees raw key values:
- Settings page shows "Set / Not set" status only
- Settings API filters out any config row containing "key", "token", "secret"
- Error bodies sanitised before SSE emission (no raw API error responses)
- Rate limiting: 20 auth attempts/15min · 120 API calls/min (express-rate-limit)
- trust proxy: 1 required for Render (behind reverse proxy, fixes X-Forwarded-For)`,
      },
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend Architecture',
    color: '#00C896',
    description: 'React app structure, state management, and real-time features',
    prompts: [
      {
        title: 'AgentContext — Global Run State',
        context: 'Why the agent state lives in context instead of the page component',
        prompt: `Problem: if run state lives in AgentRunner.jsx, navigating away kills the run.
Solution: AgentContext wraps the entire layout — runs survive navigation.

AgentContext holds:
- running, accounts, stepLog, progress, summary, connErr, stats
- esRef (EventSource ref) — nulled BEFORE es.close() to prevent onerror clobbering complete state
- completedRef — set on complete event to prevent false "connection lost" on normal close

Key fix: complete event handler sequence:
1. setSummary(d)
2. completedRef.current = true
3. esRef.current = null  ← MUST be before close
4. es.close()

Without step 3: browser fires onerror after close → overwrites clean summary with error state.`,
      },
      {
        title: 'SSE Streaming Architecture',
        context: 'Real-time data streaming from backend to browser',
        prompt: `Server-Sent Events (SSE) chosen over WebSocket because:
- Simpler (HTTP GET, no upgrade handshake)
- Works on Render free tier (no sticky sessions needed)
- EventSource auto-reconnects (we disable with retry:0)

Backend sends named events: status, search_done, account, fetch_error, quota_exhausted, complete
Frontend registers individual listeners: es.addEventListener('account', handler)

Critical settings:
- res.write('retry: 0\\n\\n') — prevents auto-reconnect after normal close
- keepAlive: send ': ping\\n\\n' every 5s during rate-limit waits (Render drops idle after 30s)
- auth via _token query param (EventSource cannot send headers)`,
      },
      {
        title: 'Track A Filter System',
        context: 'How the accounts page filter and sort logic works',
        prompt: `Track A sorts in this order (promotion_type priority):
1. A1 explicit (💰 confirmed paid) → sorted by overall score desc
2. A2 inferred (~ likely paid) → sorted by overall score desc
3. Unknown → sorted by overall score desc

Filter chips: A1 and A2 only (Not Paid and Unknown hidden — no use case for showing them).
Sort uses: promoOrder = { explicit: 0, inferred: 1, none: 2, unknown: 3 }

The filter converts null/undefined promotion_type to 'unknown':
  const pt = a.promotion_type || 'unknown'
This prevents null values (accounts scored before feature existed) from breaking filters.`,
      },
    ],
  },
];

function PromptCard({ prompt }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(prompt.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="prompt-card">
      <div className="prompt-card-header">
        <div>
          <div className="prompt-card-title">{prompt.title}</div>
          <div className="prompt-card-context">{prompt.context}</div>
        </div>
        <button className="prompt-copy-btn" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="prompt-body">{prompt.prompt}</pre>
    </div>
  );
}

export default function PromptsPage() {
  const [active, setActive] = useState('agent-run');
  const section = SECTIONS.find(s => s.id === active);

  return (
    <div className="page prompts-page">
      <div className="page-header">
        <div>
          <h1>Build Prompts</h1>
          <p className="page-sub">The prompts and logic used to build each feature of this application</p>
        </div>
      </div>

      <div className="prompts-layout">
        {/* Section nav */}
        <div className="prompts-nav">
          {SECTIONS.map(s => (
            <button key={s.id}
              className={`prompts-nav-item${active===s.id?' active':''}`}
              style={active===s.id?{borderLeftColor:s.color,color:s.color}:{}}
              onClick={() => setActive(s.id)}>
              <span className="prompts-nav-label">{s.label}</span>
              <span className="prompts-nav-count">{s.prompts.length}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="prompts-content">
          <div className="prompts-section-header" style={{ borderLeftColor: section?.color }}>
            <h2 style={{ color: section?.color }}>{section?.label}</h2>
            <p>{section?.description}</p>
          </div>
          {section?.prompts.map((p, i) => (
            <PromptCard key={i} prompt={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
