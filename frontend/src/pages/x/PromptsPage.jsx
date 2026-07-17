import { useState } from 'react';

const SECTIONS = [
  {
    id: 'agent-run',
    label: 'Agent Run & Discovery',
    color: '#00F5D4',
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
        title: 'D2 + D3 — AI Scoring Prompt (Gemini 2.5 Flash)',
        context: 'The batch prompt sent to Gemini for 6 accounts at a time (fallback: Claude Haiku 4.5)',
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

D2 and D3 come from Gemini 2.5 Flash (reads bio + name).
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
    description: 'Evidence-based paid-promoter detection — learn the paid-post pattern, then check each post',
    prompts: [
      {
        title: 'Core Classification Logic',
        context: 'The key insight: ambassador ≠ available, own-brand founder ≠ promoter',
        prompt: `The key question: is this account AVAILABLE for paid collaborations with KiteAI?

A1 (confirmed available):
- "DM for collabs", "DM for paid promo", "open to brand deals"
- "media kit", "UGC creator", "content creator for hire"
- collab@email, partnerships@email
- #ad / #sponsored / "paid partnership" in bio OR a post

A2 (likely — detected by post PATTERN, must have quoted evidence):
- Promotes ≥2 DIFFERENT brands with CTAs/links
- Discount codes ("use code X"), affiliate links (?ref=, link in bio)
- Brand giveaways ("RT + follow @X to win")

NOT a hireable promoter (→ none / unknown):
- "Ambassador @brand" / "Official X ambassador" → single-brand exclusive
- Founder promoting only their OWN product → a brand, not for hire
- Researcher / journalist / pure technical threads → organic`,
      },
      {
        title: 'Paid-Post Pattern Detector (Gemini 2.5 Flash)',
        context: 'Replaces the old vague "is this paid?" check — defines what a paid POST looks like, requires quoted evidence',
        prompt: `You are a sponsored-content detector for KiteAI (hires influencers for PAID promotions).
GOAL: Decide if @{handle} takes money/products to promote OTHER companies' products.

Bio: "{bio}"
Auto-detected signals → disclosures:N codes:N affiliate-links:N giveaways:N brand+CTA:N | distinct brands:N
Recent posts:
{20 original posts, retweets skipped}

=== HOW A PAID POST LOOKS (learn this pattern) ===
PAID:
  "Loving my setup from @brandX — use code SAVE20, link in bio #ad"   → explicit (disclosure + code)
  "Thanks @toolY for sponsoring. Sign up: site.com/?ref=me"           → explicit (sponsor + affiliate)
  "Testing @appA and @appB this month, both great — try them 👇"      → inferred (2 brands + CTA)
NOT PAID:
  "Debugging our inference stack — here's what I learned 🧵"           → none (technical)
  "We just shipped v2 of OUR product 🚀"                              → none (own company, not for hire)

=== RULES (no compromise) ===
- explicit: ≥1 post has a clear disclosure OR code/affiliate for someone else
- inferred: no tag, but a pattern — ≥2 different brands w/ CTAs, or brand giveaways
- none: technical/research/journalism/personal, OR only their OWN product
- unknown: too few posts / no signal — do NOT guess
- EVERY explicit/inferred verdict MUST quote the exact post that proves it

Return ONLY JSON: {"promotion_type":"explicit|inferred|none|unknown","confidence":0-100,"signals":["<reason + quoted post>"],"brands":["@b1","@b2"]}`,
      },
      {
        title: 'Cheap Regex Pre-Scan (free, before AI)',
        context: 'Each post is scanned for signals first — backstop + brand-spread count',
        prompt: `scanPostsForSignals(posts) flags each post (no API/AI cost):

DISCLOSURE → A1:  #ad #sponsored #spon #paidpartnership "sponsored by" "in partnership with"
CODE → A2:        "use code X" "20% off" promo/discount/coupon code
AFFILIATE → A2:   ?ref= utm_ amzn.to bit.ly "link in bio to shop" "commission"
GIVEAWAY → A2:    "giveaway" "RT + follow to win" "enter to win"
BRAND+CTA → A2:   @mention + (try|sign up|get yours|shop|grab|claim)

Also counts DISTINCT brands across promo posts (≥2 = serial-promoter pattern).

Quality backstops:
- A real #ad/#sponsored tag can NEVER be rated below A1 (regex override on the AI)
- If the AI call fails → fall back to these regex signals
- Output feeds the Gemini prompt as "Auto-detected signals" for calibration`,
      },
      {
        title: 'A2 Authenticity Scoring (Genuine vs Salesy)',
        context: 'Split A2 by content quality — keep only genuine creators an audience trusts (option B)',
        prompt: `Among A2 (likely-paid) accounts, rank how GENUINE the product content reads.
We want creators who post "I tried this, here's my honest take" — not hyped ads or
AI/templated spam. Gemini scores 0-100 (blended 70% AI + 30% regex hint), reading 20 posts.

RAISES score (Genuine, >= 60):
  - first-person lived experience ("I've been using…", "switched to…")
  - specific details (features, timeframes, real use-case)
  - honest/balanced (admits a downside, "skeptical at first")
  - natural conversational voice + real reasoning
LOWERS score (Salesy, < 60):
  - hype overload (ALL CAPS, 🚀🔥, "BEST EVER")
  - generic / templated / interchangeable praise
  - pure CTA / link-dump
  - robotic, no personal voice  (low-weight "AI-ish" proxy)

Buckets (threshold 60): ✦ Genuine (>=60) · ◷ Unscored (null) · ⚠ Salesy (<60).
Stored: authenticity_score / authenticity_reason / authenticity_example (quoted post).
NOTE: we score genuine-quality DIRECTLY rather than "is it AI?" — research shows
AI-text detection is unreliable and false-flags real people.`,
      },
      {
        title: 'Resolve Unknowns + Quality Backfill',
        context: 'One-pass job: classify the unknown/none backlog AND score A2 authenticity',
        prompt: `Most accounts predate the detector and sit as unknown/none/unscored.
GET /api/resolve-unknowns (SSE) re-runs the detector over the backlog:

1. SELECT handle,bio FROM accounts WHERE track='A' AND (
     promotion_type IN ('unknown','none')                       ← classify
     OR (promotion_type IN ('inferred','explicit')
         AND authenticity_score IS NULL) )                      ← quality-score A2
   ORDER BY overall DESC          ← relevant accounts first
2. For each: fetch 20 posts → analysePaidPattern → resolve type + score authenticity
3. Idempotent (scored accounts not re-picked) · 3 RPM · 5,000 cap · abortable.
4. Stream live tally: { toA1, toA2, genuine, salesy, toNone, stillUnknown, processed, total }

Live agent does this too: stale unknown/none duplicates are re-checked on
every refresh, so the backlog shrinks automatically over time.`,
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
    color: '#00F5D4',
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
      {
        title: 'Last Run Summary Card',
        context: 'Dashboard card showing the most recent run’s totals + A1/A2/B split',
        prompt: `Show a per-run breakdown on the Dashboard: total fetched last run,
and how they split into A1 / A2 / Track B / Other.

Why compute from accounts.run_id (not the runs table)?
- upsertAccount sets run_id on every fetch/save (insert AND update)
- So COUNT(*) WHERE run_id = lastRunId = everything touched that run
- Accurate even when the run record never finalized (dev restart mid-run)

GET /api/pr/dashboard/last-run returns:
  { runId, status, totalFetched, newAccounts, updatedAccounts,
    a1, a2, trackB, other }
  a1 = run_id=last AND track='A' AND promotion_type='explicit'
  a2 = ...'inferred'   trackB = track='B'   other = A none/unknown
  newAccounts = run_id=last AND first_seen >= run.started_at

Card auto-refreshes on the onRunComplete hook + manual refresh.`,
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
