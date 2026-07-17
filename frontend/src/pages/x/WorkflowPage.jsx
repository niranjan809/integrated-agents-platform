import React from 'react';

/* ─── shared style tokens ─────────────────────────────────────────── */
const C = {
  blue:   '#00F5D4',
  green:  '#00C896',
  gold:   '#F9A825',
  red:    '#FF4444',
  purple: '#9B59B6',
  bg:     '#0d1117',
  card:   '#161b22',
  border: '#21262d',
  text:   '#e6edf3',
  muted:  '#8b949e',
};

/* ─── base component helpers ──────────────────────────────────────── */
function Card({ color = C.blue, step, title, children, style = {} }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 8,
      padding: '20px 24px',
      marginBottom: 0,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {step !== undefined && (
          <span style={{
            background: color,
            color: '#000',
            fontWeight: 700,
            fontSize: 11,
            borderRadius: 4,
            padding: '2px 8px',
            letterSpacing: 0.5,
          }}>
            STEP {step}
          </span>
        )}
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Arrow({ color = C.blue }) {
  return (
    <div style={{
      textAlign: 'center',
      fontSize: 22,
      color,
      lineHeight: 1,
      margin: '2px 0',
      userSelect: 'none',
    }}>
      ↓
    </div>
  );
}

function Tag({ color = C.blue, children, style = {} }) {
  return (
    <span style={{
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  );
}

function Code({ children, style = {} }) {
  return (
    <code style={{
      background: '#0d1117',
      border: `1px solid ${C.border}`,
      borderRadius: 4,
      padding: '1px 6px',
      fontSize: 12,
      fontFamily: 'monospace',
      color: '#79c0ff',
      ...style,
    }}>
      {children}
    </code>
  );
}

function Row({ children, gap = 12, style = {} }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, ...style }}>
      {children}
    </div>
  );
}

function KV({ k, v, vColor = '#79c0ff' }) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      <span style={{ color: C.muted }}>{k}: </span>
      <span style={{ color: vColor, fontFamily: 'monospace' }}>{v}</span>
    </div>
  );
}

function InfoBox({ color = C.blue, children, style = {} }) {
  return (
    <div style={{
      background: color + '11',
      border: `1px solid ${color}33`,
      borderRadius: 6,
      padding: '10px 14px',
      fontSize: 12,
      color: C.text,
      lineHeight: 1.7,
      ...style,
    }}>
      {children}
    </div>
  );
}

function FieldGrid({ fields }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: '4px 12px',
      fontFamily: 'monospace',
      fontSize: 11,
    }}>
      {fields.map(([name, type, note], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
          <span style={{ color: '#79c0ff' }}>{name}</span>
          <span style={{ color: C.muted, fontSize: 10 }}>{type}</span>
          {note && <span style={{ color: C.gold, fontSize: 10 }}>({note})</span>}
        </div>
      ))}
    </div>
  );
}

function EventRow({ name, color, when }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '160px 1fr',
      gap: 12,
      padding: '6px 0',
      borderBottom: `1px solid ${C.border}`,
      fontSize: 12,
      alignItems: 'start',
    }}>
      <Tag color={color}>{name}</Tag>
      <span style={{ color: C.text, lineHeight: 1.5 }}>{when}</span>
    </div>
  );
}

function RouteRow({ method, path, auth, returns }) {
  const methodColor = method === 'GET' ? C.green : method === 'POST' ? C.blue : method === 'PATCH' ? C.gold : C.red;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '55px 240px 80px 1fr',
      gap: 10,
      padding: '6px 0',
      borderBottom: `1px solid ${C.border}`,
      fontSize: 12,
      alignItems: 'start',
    }}>
      <Tag color={methodColor}>{method}</Tag>
      <Code style={{ fontSize: 11 }}>{path}</Code>
      <Tag color={auth ? C.gold : C.green}>{auth ? 'JWT req.' : 'public'}</Tag>
      <span style={{ color: C.muted, lineHeight: 1.5 }}>{returns}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function WorkflowPage() {
  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      padding: '32px 32px 64px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: C.text,
      maxWidth: 900,
      margin: '0 auto',
    }}>

      {/* ── Page header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>
          <span style={{ color: C.blue }}>Kite</span><span style={{ color: C.green }}>AI</span>
          <span style={{ color: C.muted, fontWeight: 400, fontSize: 16, marginLeft: 10 }}>
            X Agent — System Workflow
          </span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted }}>
          Complete pipeline documentation — trigger to database write, including rate limiting, AI scoring, and SSE streaming.
        </p>
      </div>

      {/* ── Data Flow Summary ────────────────────────────────────── */}
      <div style={{
        background: '#0d1117',
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: '20px 24px',
        marginBottom: 32,
        overflowX: 'auto',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 12, letterSpacing: 1 }}>
          DATA FLOW SUMMARY
        </div>
        <pre style={{
          margin: 0,
          fontSize: 11,
          lineHeight: 2,
          color: C.text,
          fontFamily: 'monospace',
          whiteSpace: 'pre',
        }}>{`  TRIGGER (manual click OR weekly cron: Monday 02:00 IST)
       │
       ▼
  KEYWORD LOADING ─── 61 own + up to 300 friend DB = 358 queries
       │               Build compound OR queries (4 per call): "vapi OR elevenlabs OR deepgram"
       │               Weekly rotation: 1/4 per auto-run  |  Manual: full 90 compound queries
       ▼
  SEARCH PHASE ─── /search?query=vapi+OR+elevenlabs+OR+deepgram&count=47&type=Top
       │            Cross-query frequency tracking  |  Pagination (page 2 via cursor)
       │            Rate: 3 RPM KeyPaid  |  ±3s jitter  |  human breaks  |  5,000 cap
       ▼
  PROFILE FETCH ─── /user?username=vapidev ──► twitter241 nested JSON
       │             result.core.name  |  result.legacy.description (bio)
       │             result.legacy.followers_count  |  result.is_blue_verified
       │             6-day skip: handles updated <6 days ago → skip (saves quota)
       ▼
  VALIDATION ─── followers≥100 · tweets≥1 · name not empty · (bio if <500 followers)
       │          post-score gate: overall<10 → discard
       ▼
  KEYWORD SCORING (instant) ─── D4 (authority: verified+ratio+followers) + D5 (reach tier)
       │
       ▼
  AI BATCH SCORING (6/call, Gemini 2.5 Flash) ──► D2 · D3 · type · track · promotion_type
       │
       ▼
  PROMOTION CLASSIFICATION (per Track A account, inline during fetch)
       │  Phase 1: Bio keywords (free) ──► A1 if explicit signal, or exclusion (ambassador)
       │  Phase 2: Fetch 20 posts /search?query=from:handle&count=20&type=Latest
       │           PAID-POST PATTERN DETECTOR (regex signals + Gemini, quoted evidence)
       │           ──► A1 (disclosure/code) · A2 (multi-brand pattern) · none · unknown
       │           A2 also gets an AUTHENTICITY score 0-100 → Genuine (≥60) vs Salesy (<60)
       │           Stale unknown/none duplicates are re-checked on every refresh
       ▼
  SCORE MERGE ─── Overall = D2×25% + D3×25% + D4×20% + D5×30%
       │           Track A sort: A1 → A2-Genuine (✦) → A2-Unscored → A2-Salesy (⚠) → Track B
       ▼
  DB UPSERT ─── Turso  |  handle UNIQUE → INSERT or UPDATE
       │         promotion_type · promotion_confidence · promotion_signals saved
       ▼
  SSE COMPLETE ─── accountsAdded · duplicatesSkipped · totalInDB · confirmedPaid · likelyPaid
       │           Dashboard "Last Run Summary" card: fetched + A1/A2/B/Other split
       ▼
  RESOLVE UNKNOWNS (on-demand backfill) ─── /api/resolve-unknowns
       │           Re-runs the paid-post detector over ALL unknown/none Track A
       │           accounts → promotes real promoters into A1/A2. Live tally streamed.`}</pre>
      </div>

      {/* ── Steps ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* STEP 1 — TRIGGER */}
        <Card color={C.blue} step={1} title="TRIGGER — How the Agent Starts">
          <Row gap={16} style={{ marginBottom: 12 }}>
            <InfoBox color={C.blue} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.blue }}>Manual (UI)</div>
              User clicks <Code>Run Agent</Code> on the Agent Runner page.<br />
              POST <Code>/api/agent/run</Code> (JWT required).<br />
              <Code>triggeredBy: 'manual'</Code> stored in <Code>runs</Code> table.
            </InfoBox>
            <InfoBox color={C.gold} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.gold }}>Cron (Automatic)</div>
              <Code>cron.schedule('0 2 * * 1', ...)</Code><br />
              Runs every Monday at <strong>02:00 AM IST</strong> (Asia/Kolkata).<br />
              Pre-condition: <Code>auto_run_enabled = '1'</Code> in agent_config.<br />
              Must have at least one keyword or direct handle.<br />
              <Code>triggeredBy: 'cron'</Code> — no SSE output.
            </InfoBox>
          </Row>
          <Row gap={8}>
            <Tag color={C.blue}>runAgent() called</Tag>
            <Tag color={C.green}>runs row inserted — status: 'running'</Tag>
            <Tag color={C.muted}>globalConsecutive429 reset to 0</Tag>
          </Row>
        </Card>

        <Arrow />

        {/* STEP 2 — KEYWORD LOADING */}
        <Card color={C.green} step={2} title="KEYWORD LOADING — Own DB + Friend DB → Merged Queries">
          <Row gap={16} style={{ marginBottom: 12 }}>
            <InfoBox color={C.green} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.green }}>Own Database (Turso)</div>
              <strong>55 keywords</strong> seeded at startup (8 classes):<br />
              Class C — Voice AI Stack (18): <Code>vapi</Code>, <Code>elevenlabs</Code>, <Code>deepgram</Code>…<br />
              Class A — AI Models (11): <Code>gpt-4</Code>, <Code>claude ai</Code>, <Code>openai</Code>…<br />
              Class B — Orchestration (9): <Code>langchain</Code>, <Code>n8n</Code>, <Code>ai agent</Code>…<br />
              Class E/F/H/K — Regional, vertical, influencer, product keywords.<br />
              Active keywords only (<Code>active = 1</Code>).
            </InfoBox>
            <InfoBox color={C.gold} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.gold }}>Friend DB (Read-Only Turso)</div>
              <strong>1506 keywords</strong> across 9 class_keys.<br />
              <strong>42 influencer handles</strong> (direct fetch, no search).<br />
              Loaded via <Code>FRIEND_TURSO_URL</Code> env var.<br />
              Max <strong>300</strong> enabled search queries per run (priority-ordered).<br />
              <strong>STRICT:</strong> SELECT only — no INSERT/UPDATE/DELETE ever.
            </InfoBox>
          </Row>
          <InfoBox color={C.blue} style={{ marginBottom: 10 }}>
            <strong>Merge:</strong> own 61 + friend 300 = ~358 unique queries (deduped) + 42 direct handles.
            Queries are shuffled randomly each run (anti-bot pattern variation).
          </InfoBox>
          <InfoBox color={C.purple}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: C.purple }}>Compound OR Query Building (NEW)</div>
            Instead of 358 separate search calls, keywords are grouped 4 per call:<br />
            <Code>"vapi OR elevenlabs OR deepgram OR retell ai"</Code> = 1 call instead of 4<br /><br />
            358 keywords ÷ 4 = <strong>~90 compound queries</strong> (saves ~268 API calls → freed for profile fetches)<br /><br />
            <strong>Weekly rotation (auto-runs):</strong> only 1/4 of queries per run using <Code>i % 4 === weekSlot</Code><br />
            Week 1: indices 0,4,8… | Week 2: 1,5,9… | etc. = 4× more profile budget per run<br />
            Manual runs always use full ~90 compound queries.
          </InfoBox>
        </Card>

        <Arrow />

        {/* STEP 3 — SEARCH PHASE */}
        <Card color={C.blue} step={3} title="SEARCH PHASE — Query X for Handles">
          <InfoBox color={C.blue} style={{ marginBottom: 12 }}>
            Each call is a compound OR query (4-5 keywords). Count varies 40–50. Page 2 fetched via cursor.
            Handles sorted by cross-query frequency — accounts seen in 3+ searches fetched first.
          </InfoBox>

          {/* ── Exact API Request String ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Exact API Request — Compound OR Search
            </div>
            <div style={{ background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9 }}>
              <div><span style={{ color: C.green }}>GET</span> <span style={{ color: '#79c0ff' }}>https://twitter241.p.rapidapi.com/search</span></div>
              <div style={{ color: C.muted, marginTop: 6 }}>Query Parameters:</div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: C.gold }}>query</span><span style={{ color: C.muted }}> = </span><span style={{ color: '#a5d6ff' }}>"vapi OR elevenlabs OR deepgram OR retell ai"</span><br />
                <span style={{ color: C.gold }}>count</span><span style={{ color: C.muted }}> = </span><span style={{ color: '#a5d6ff' }}>47</span><span style={{ color: C.muted }}> (varies 40–50, anti-bot)</span>
              </div>
              <div style={{ color: C.muted, marginTop: 6 }}>Headers:</div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: C.gold }}>X-RapidAPI-Key</span><span style={{ color: C.muted }}>:  </span><span style={{ color: '#a5d6ff' }}>YOUR_RAPIDAPI_KEY_HERE</span><br />
                <span style={{ color: C.gold }}>X-RapidAPI-Host</span><span style={{ color: C.muted }}>: </span><span style={{ color: '#a5d6ff' }}>twitter241.p.rapidapi.com</span>
              </div>
              <div style={{ color: C.muted, marginTop: 8, fontSize: 10 }}>Full URL string:</div>
              <div style={{ color: '#00F5D4', wordBreak: 'break-all', marginTop: 2 }}>
                https://twitter241.p.rapidapi.com/search?query=vapi+OR+elevenlabs+OR+deepgram+OR+%22retell+ai%22&count=47&type=Top
              </div>
            </div>
          </div>

          {/* ── What comes back ── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Response — What We Extract
            </div>
            <div style={{ background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9 }}>
              <div><span style={{ color: C.purple }}>{'{'}</span></div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: C.blue }}>"timeline"</span><span style={{ color: C.muted }}>: [</span>
              </div>
              <div style={{ paddingLeft: 32 }}>
                <span style={{ color: C.muted }}>{'{ '}</span><span style={{ color: C.blue }}>"screen_name"</span><span style={{ color: C.muted }}>: </span><span style={{ color: '#a5d6ff' }}>"vapidev"</span><span style={{ color: C.muted }}>,  </span><span style={{ color: C.muted, fontSize: 10 }}>← WE KEEP THIS</span>
              </div>
              <div style={{ paddingLeft: 32 }}>
                <span style={{ color: C.blue }}>"full_text"</span><span style={{ color: C.muted }}>: </span><span style={{ color: '#a5d6ff' }}>"Excited about voice AI..."</span><span style={{ color: C.muted }}>, </span><span style={{ color: C.muted, fontSize: 10 }}>← ignored</span>
              </div>
              <div style={{ paddingLeft: 32 }}>
                <span style={{ color: C.blue }}>"retweet_count"</span><span style={{ color: C.muted }}>: 12, </span><span style={{ color: C.muted, fontSize: 10 }}>← ignored</span>
              </div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.muted }}>{'}'}</span>, <span style={{ color: C.muted }}>...up to 50 tweets</span></div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.muted }}>]</span></div>
              <div><span style={{ color: C.purple }}>{'}'}</span></div>
            </div>
          </div>

          <Row gap={8} style={{ marginBottom: 6 }}>
            <Tag color={C.green}>Result: compound query → up to 47 handles page 1 + 47 page 2 = ~80-90 unique handles per compound query</Tag>
          </Row>
          <InfoBox color={C.purple} style={{ marginBottom: 10 }}>
            <strong>Page 2 (cursor pagination):</strong> After page 1, extract <Code>response.cursor.bottom</Code> and make a second call:<br />
            <Code>?query=vapi+OR+elevenlabs...&count=47&type=Top&cursor=DAACCgACHJ...</Code><br />
            If budget allows, doubles handles discovered per compound query.
          </InfoBox>
          <Row gap={8}>
            <InfoBox color={C.red} style={{ flex: 1 }}>
              <strong style={{ color: C.red }}>On failure:</strong> emit <Tag color={C.red}>error</Tag> event, flag limited/blocked, <Code>continue</Code> to next query.
            </InfoBox>
          </Row>
        </Card>

        <Arrow />

        {/* STEP 4 — RATE LIMITER */}
        <Card color={C.gold} step={4} title="RATE LIMITER + ANTI-BOT — Paid Key, Proactive Pacing">
          <Row gap={16} style={{ marginBottom: 12 }}>
            <InfoBox color={C.gold} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.gold }}>Proactive Pacing (paid key only)</div>
              <KV k="Key" v="KeyPaid only — free keys removed" />
              <KV k="PAID_RPM" v="3 req/min (conservative for shared key)" />
              <KV k="MIN_GAP_MS" v="20,000 ms between requests (3 RPM)" />
              <KV k="JITTER_MS" v="±3,000 ms — large randomness, unpredictable" />
              <KV k="Cap/run" v="5,000 requests max then graceful stop" />
            </InfoBox>
            <InfoBox color={C.purple} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.purple }}>Anti-Bot Measures</div>
              <KV k="Jitter" v="±3s random spread — no mechanical pattern" vColor={C.purple} />
              <KV k="Human breaks" v="30-60s pause every 20-35 requests" vColor={C.purple} />
              <KV k="Query shuffle" v="Order randomised on every run" vColor={C.purple} />
              <KV k="Count variation" v="search count varies 40-50, not always 50" vColor={C.purple} />
              <KV k="Skip recent" v="accounts updated &lt;6 days skipped" vColor={C.purple} />
            </InfoBox>
          </Row>
          <InfoBox color={C.red}>
            <strong>Error handling:</strong>
            429 → 75s cooldown · 403 → 60min cooldown · 3 consecutive 429s → QuotaExhaustedError → run stops, data saved.<br />
            <strong>SSE keepalive:</strong> <Code>{': ping\\n\\n'}</Code> sent every 8s during sleeps to keep browser connection alive.
          </InfoBox>
        </Card>

        <Arrow />

        {/* STEP 5 — PROFILE FETCH */}
        <Card color={C.blue} step={5} title="PROFILE FETCH — Fetch Each Handle via screenname.php">
          <InfoBox color={C.blue} style={{ marginBottom: 12 }}>
            One API call per handle. Rate-limited to 3 RPM (20s gap) with ±3s jitter + human breaks.
            Handles updated within 6 days are skipped to save quota on weekly re-runs.
          </InfoBox>

          {/* ── Exact API Request String ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Exact API Request — Profile Fetch
            </div>
            <div style={{ background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9 }}>
              <div><span style={{ color: C.green }}>GET</span> <span style={{ color: '#79c0ff' }}>https://twitter241.p.rapidapi.com/screenname.php</span></div>
              <div style={{ color: C.muted, marginTop: 6 }}>Query Parameters:</div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: C.gold }}>screenname</span><span style={{ color: C.muted }}> = </span><span style={{ color: '#a5d6ff' }}>"vapidev"</span><span style={{ color: C.muted }}> (no @ symbol)</span>
              </div>
              <div style={{ color: C.muted, marginTop: 6 }}>Headers:</div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: C.gold }}>X-RapidAPI-Key</span><span style={{ color: C.muted }}>:  </span><span style={{ color: '#a5d6ff' }}>YOUR_RAPIDAPI_KEY_HERE</span><br />
                <span style={{ color: C.gold }}>X-RapidAPI-Host</span><span style={{ color: C.muted }}>: </span><span style={{ color: '#a5d6ff' }}>twitter241.p.rapidapi.com</span>
              </div>
              <div style={{ color: C.muted, marginTop: 8, fontSize: 10 }}>Full URL string:</div>
              <div style={{ color: '#00F5D4', marginTop: 2 }}>
                https://twitter241.p.rapidapi.com/user?username=vapidev    (no @ symbol)
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 8 }}>
            Fields extracted from screenname.php response:
          </div>
          <FieldGrid fields={[
            ['handle', 'TEXT', 'screen_name'],
            ['name', 'TEXT', 'display name'],
            ['bio', 'TEXT', 'description'],
            ['followers', 'INTEGER', 'followers_count'],
            ['following', 'INTEGER', 'friends_count'],
            ['tweets', 'INTEGER', 'statuses_count'],
            ['verified', 'BOOL', 'blue_verified'],
            ['avatar', 'TEXT', 'profile_image_url'],
            ['website', 'TEXT', 'url'],
            ['location', 'TEXT', ''],
            ['joined_date', 'TEXT', 'created_at'],
          ]} />
        </Card>

        <Arrow />

        {/* STEP 5.5 — PROFILE VALIDATION (MINIMUM BAR) */}
        <Card color={C.red} title="PROFILE VALIDATION — Minimum Bar (Discard Invalid Profiles)">
          <InfoBox color={C.red} style={{ marginBottom: 14 }}>
            <strong>Runs immediately after each profile fetch, before scoring.</strong><br />
            Invalid profiles are discarded so AI quota is never wasted on bots or empty accounts.
            A <Tag color={C.muted}>status / filtered</Tag> SSE event is emitted for each skipped account.
          </InfoBox>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { check: 'followers < 100', reason: 'Likely bot, spam, or brand-new account with no real audience', icon: '🤖' },
              { check: 'tweets === 0', reason: 'Account has never posted — inactive, placeholder, or suspended', icon: '💤' },
              { check: 'name is empty', reason: 'Deactivated or suspended account — API returns blank name', icon: '❌' },
              { check: 'followers < 500 AND bio is empty', reason: 'Low-reach account with nothing to evaluate — no signal at all', icon: '🕳' },
            ].map(({ check, reason, icon }) => (
              <div key={check} style={{
                background: C.bg,
                border: `1px solid ${C.red}33`,
                borderLeft: `3px solid ${C.red}`,
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 12,
              }}>
                <div style={{ fontFamily: 'monospace', color: C.red, marginBottom: 4, fontSize: 11 }}>
                  {icon} DISCARD if: {check}
                </div>
                <div style={{ color: C.muted, lineHeight: 1.5 }}>{reason}</div>
              </div>
            ))}
          </div>
          <InfoBox color={C.green}>
            <strong>Profiles that PASS the minimum bar:</strong><br />
            ≥ 100 followers · ≥ 1 tweet · has a name · (if &lt; 500 followers, must have a bio).<br />
            These go forward into scoring. Everything else is logged and skipped.
          </InfoBox>
        </Card>

        <Arrow />

        {/* STEP 6 — KEYWORD SCORING */}
        <Card color={C.green} step={6} title="KEYWORD SCORING — Algorithmic D4 & D5 (Instant, No API Call)">
          <Row gap={16} style={{ marginBottom: 12 }}>
            <InfoBox color={C.green} style={{ flex: '0 0 380px' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.green }}>D4 — Influence Signals (weight 20%)</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9 }}>
                <div><span style={{ color: C.gold }}>+30</span> if <Code>blue_verified</Code></div>
                <div><span style={{ color: C.gold }}>+35</span> if followers/following &ge; 30</div>
                <div><span style={{ color: C.gold }}>+22</span> if ratio &ge; 10</div>
                <div><span style={{ color: C.gold }}>+12</span> if ratio &ge; 3</div>
                <div><span style={{ color: C.gold }}>+30</span> if followers &ge; 100K</div>
                <div><span style={{ color: C.gold }}>+20</span> if followers &ge; 10K</div>
                <div><span style={{ color: C.gold }}>+10</span> if followers &ge; 1K</div>
                <div style={{ color: C.muted }}>Cap: min(95, sum)</div>
              </div>
            </InfoBox>
            <InfoBox color={C.green} style={{ flex: '0 0 380px' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.green }}>D5 — Reach Tier (weight 30%)</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9 }}>
                <div><span style={{ color: C.blue }}>95</span> — Macro &ge; 500K followers</div>
                <div><span style={{ color: C.blue }}>80</span> — Mid-Tier &ge; 100K followers</div>
                <div><span style={{ color: C.blue }}>60</span> — Micro &ge; 10K followers</div>
                <div><span style={{ color: C.blue }}>40</span> — Nano &ge; 1K followers</div>
                <div><span style={{ color: C.blue }}>25</span> — &ge; 500 followers</div>
                <div><span style={{ color: C.blue }}>10</span> — &lt; 500 followers</div>
              </div>
            </InfoBox>
          </Row>
          <InfoBox color={C.muted}>
            <strong>D2 &amp; D3 keyword fallback</strong> (used when AI is unavailable):<br />
            D2 (Collab Openness): 82 if bio has collab keywords (dm open, partnership, contact…) | 50 if has website | 18 otherwise.<br />
            D3 (AI Relevance): <Code>aiHits × 12 + (bio.length &gt; 30 ? 8 : 0)</Code>, capped at 95.
            aiHits = count of AI keywords matching bio/name (ai, llm, gpt, voice, nlp, developer, founder, saas, vapi, elevenlabs…).
          </InfoBox>
        </Card>

        <Arrow />

        {/* STEP 7 — AI BATCH SCORING */}
        <Card color={C.gold} step={7} title="AI BATCH SCORING — Gemini 2.5 Flash via OpenRouter (6 accounts / call)">
          <Row gap={16} style={{ marginBottom: 12 }}>
            <InfoBox color={C.gold} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.gold }}>Batch Setup</div>
              <KV k="Primary model" v="google/gemini-2.5-flash" vColor={C.gold} />
              <KV k="Fallback model" v="anthropic/claude-haiku-4-5" vColor={C.muted} />
              <KV k="Batch size" v="BATCH_SIZE = 6 accounts per call" />
              <KV k="Progress" v="80% → 95% of run progress bar" />
              <KV k="Pre-check" v="Handles already in DB are skipped (no re-scoring)" />
              <KV k="Provider" v="OpenRouter (OPENROUTER_API_KEY env var)" />
            </InfoBox>
            <InfoBox color={C.gold} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.gold }}>Prompt Contract</div>
              Input per account: handle, name, follower count, verified, website presence, bio (max 160 chars).<br />
              Returns <strong>JSON array only</strong> — no markdown, same order as input.<br />
              <div style={{ marginTop: 6 }}>
                Each object:<br />
                <Code>d2</Code> — Collab Intent 0-100<br />
                <Code>d3</Code> — AI Relevance 0-100<br />
                <Code>type</Code> — Influencer | PR Page | AI Media | Brand Page | Account<br />
                <Code>track</Code> — A (collab pipeline) | B (ads audience)<br />
                <Code>promotion_type</Code> — explicit | inferred | none | unknown (from bio)<br />
                <Code>promotion_signals</Code> — up to 3 detected signals<br />
                <Code>model</Code> — added by JS layer
              </div>
            </InfoBox>
          </Row>
          <InfoBox color={C.red}>
            <strong>Fallback:</strong> If AI call fails or OpenRouter is unavailable, the keyword heuristic D2/D3 scores
            computed in Step 6 are used as-is. The run continues — AI scoring is non-blocking.
          </InfoBox>
        </Card>

        <Arrow />

        {/* STEP 8 — FINAL SCORE */}
        <Card color={C.blue} step={8} title="FINAL SCORE — Merge AI + Keyword Scores → Overall">
          <div style={{
            background: '#0d1117',
            borderRadius: 8,
            padding: '18px 22px',
            marginBottom: 14,
            border: `1px solid ${C.border}`,
            fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 12 }}>
              <span style={{ color: C.gold, fontWeight: 700 }}>Overall</span>
              {' = '}
              <span style={{ color: '#79c0ff' }}>D2</span>
              <span style={{ color: C.muted }}> × </span>
              <span style={{ color: C.green }}>0.25</span>
              <span style={{ color: C.muted }}> + </span>
              <span style={{ color: '#79c0ff' }}>D3</span>
              <span style={{ color: C.muted }}> × </span>
              <span style={{ color: C.green }}>0.25</span>
              <span style={{ color: C.muted }}> + </span>
              <span style={{ color: '#79c0ff' }}>D4</span>
              <span style={{ color: C.muted }}> × </span>
              <span style={{ color: C.green }}>0.20</span>
              <span style={{ color: C.muted }}> + </span>
              <span style={{ color: '#79c0ff' }}>D5</span>
              <span style={{ color: C.muted }}> × </span>
              <span style={{ color: C.green }}>0.30</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[
                ['D2', 'Collab Intent', '25%', 'AI (or keyword fallback)'],
                ['D3', 'AI Relevance', '25%', 'AI (or keyword fallback)'],
                ['D4', 'Influence Signals', '20%', 'keyword scorer always'],
                ['D5', 'Reach Tier', '30%', 'keyword scorer always'],
              ].map(([dim, label, weight, source]) => (
                <div key={dim} style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '10px 12px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#79c0ff' }}>{dim}</div>
                  <div style={{ fontSize: 11, color: C.text, margin: '4px 0 2px' }}>{label}</div>
                  <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>{weight}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{source}</div>
                </div>
              ))}
            </div>
          </div>
          <Row gap={8}>
            <InfoBox color={C.blue} style={{ flex: 1 }}>
              <strong style={{ color: C.blue }}>Track A</strong> — Collab pipeline.<br />
              AI assigned <Code>track: "A"</Code>. High D2 (collab intent).<br />
              Visible in <em>Track A</em> page (<Code>/influencers</Code>).
            </InfoBox>
            <InfoBox color={C.purple} style={{ flex: 1 }}>
              <strong style={{ color: C.purple }}>Track B</strong> — Ads audience.<br />
              AI assigned <Code>track: "B"</Code>. Broad reach, lower collab signal.<br />
              Visible in <em>Track B</em> page (<Code>/pr-pages</Code>).
            </InfoBox>
          </Row>
        </Card>

        <Arrow />

        {/* RANKING & WHAT WE LOOK FOR */}
        <Card color={C.purple} title="RANKING & WHAT WE LOOK FOR — Ideal Profile Characteristics">
          <InfoBox color={C.purple} style={{ marginBottom: 16 }}>
            All profiles that pass the minimum bar are saved to the database and ranked by <strong>Overall score (0–100)</strong>.
            There is no hard cutoff — the UI filters let you slice by tier. Here's what makes a high-scoring profile:
          </InfoBox>

          {/* Score tiers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { tier: 'TIER 1 — Top Pick', range: '≥ 65', color: C.green, profiles: ['Macro/Mid-Tier influencer (100K+ followers)', '"DM open" or email in bio', 'AI/voice content creator or builder', 'Verified account', 'Strong AI keyword density in bio'] },
              { tier: 'TIER 2 — Good', range: '45–64', color: C.gold, profiles: ['Micro influencer (10K–100K followers)', 'Has website, some collab signals', 'Mentions AI/tech regularly', 'Active poster, decent ratio'] },
              { tier: 'ARCHIVE', range: '< 45', color: '#888', profiles: ['Nano/low followers (500–10K)', 'No collab signals', 'Minimal AI relevance', 'Still saved for reference / ads targeting'] },
            ].map(({ tier, range, color, profiles }) => (
              <div key={tier} style={{ background: C.bg, border: `1px solid ${color}44`, borderTop: `3px solid ${color}`, borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ color, fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{tier}</div>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>Score {range}</div>
                {profiles.map(p => (
                  <div key={p} style={{ fontSize: 11, color: C.text, lineHeight: 1.7 }}>✓ {p}</div>
                ))}
              </div>
            ))}
          </div>

          {/* Score formula with worked example */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 12 }}>
              SCORING FORMULA — Worked Example: @vapidev (12,400 followers, verified, "DM for partnerships")
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 2.2 }}>
              {[
                { dim: 'D2', name: 'Collab Intent', weight: '25%', calc: '"DM for partnerships" in bio → AI scores 88', val: 88, ai: true },
                { dim: 'D3', name: 'AI Relevance', weight: '25%', calc: '"Build voice AI apps" → AI scores 95', val: 95, ai: true },
                { dim: 'D4', name: 'Authority', weight: '20%', calc: '+30 verified + +22 ratio≥10 + +20 10K+ = 72', val: 72, ai: false },
                { dim: 'D5', name: 'Reach Quality', weight: '30%', calc: '12,400 followers → Micro tier = 60', val: 60, ai: false },
              ].map(({ dim, name, weight, calc, val, ai }) => (
                <div key={dim} style={{ display: 'grid', gridTemplateColumns: '36px 130px 50px 1fr 50px', gap: 8, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
                  <span style={{ color: '#79c0ff', fontWeight: 700 }}>{dim}</span>
                  <span style={{ color: C.text, fontSize: 11 }}>{name}</span>
                  <span style={{ color: C.green }}>{weight}</span>
                  <span style={{ color: C.muted, fontSize: 11 }}>{calc} {ai ? <Tag color={C.gold} style={{ fontSize: 9 }}>AI</Tag> : <Tag color={C.green} style={{ fontSize: 9 }}>algo</Tag>}</span>
                  <span style={{ color: '#79c0ff', textAlign: 'right' }}>{val}</span>
                </div>
              ))}
              <div style={{ borderTop: `2px solid ${C.purple}`, paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span style={{ color: C.text }}>Overall = 88×0.25 + 95×0.25 + 72×0.20 + 60×0.30</span>
                <span style={{ color: C.purple, fontSize: 16 }}>= 78</span>
              </div>
            </div>
          </div>

          {/* Track A vs B */}
          <Row gap={12}>
            <InfoBox color={C.green} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: C.green, marginBottom: 6 }}>TRACK A — Collab Pipeline</div>
              Types: Influencer · AI Media · Account<br />
              <strong>Action:</strong> Contact directly — DM on X, cold email, propose deal.<br />
              <strong>Goal:</strong> Paid review, sponsored post, co-marketing.<br />
              <Code style={{ fontSize: 10 }}>/accounts → /influencers</Code>
            </InfoBox>
            <InfoBox color={C.gold} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: C.gold, marginBottom: 6 }}>TRACK B — Ads Audience Only</div>
              Types: PR Page · Brand Page<br />
              <strong>Action:</strong> Never contact directly. Use for X Ads targeting.<br />
              <strong>Goal:</strong> Target <em>their followers</em> with paid ads.<br />
              <Code style={{ fontSize: 10 }}>/pr-pages</Code>
            </InfoBox>
          </Row>
          <InfoBox color={C.muted} style={{ marginTop: 10, fontSize: 11 }}>
            <strong>Track is enforced by type, not by AI suggestion.</strong> If AI classifies type as "PR Page" or "Brand Page",
            the backend always sets track = "B" — even if AI returns track = "A". This prevents the @gokiteai-style bug.
          </InfoBox>
        </Card>

        <Arrow />

        {/* TRACK A PROMOTION CLASSIFICATION — A1 / A2 */}
        <Card color={C.purple} title="TRACK A PROMOTION CLASSIFICATION — Evidence-Based Paid-Post Detector">
          <InfoBox color={C.purple} style={{ marginBottom: 14 }}>
            Every Track A account is classified inline during the run — no separate step. Instead of
            asking "is this account paid?", we define <strong>what a paid POST looks like</strong>, scan each
            recent post for those signals, then let Gemini make an <strong>evidence-based verdict that must
            quote the post proving it.</strong> Key question: <em>is this account available for paid collab with KiteAI?</em>
          </InfoBox>

          <Row gap={12} style={{ marginBottom: 14 }}>
            <InfoBox color={C.green} style={{ flex: 1 }}>
              <div style={{ fontWeight:700, color:C.green, marginBottom:6 }}>💰 A1 — Confirmed (explicit)</div>
              Bio OR a post clearly discloses paid work with any brand:<br />
              <Code>"DM for collabs"</Code> · <Code>"media kit"</Code> · <Code>collab@email</Code><br />
              <Code>#ad</Code> · <Code>#sponsored</Code> · <Code>"paid partnership"</Code><br />
              discount code / affiliate link promoting someone else<br /><br />
              Bio-explicit → <strong>skip post fetch</strong> (already confirmed)
            </InfoBox>
            <InfoBox color={C.gold} style={{ flex: 1 }}>
              <div style={{ fontWeight:700, color:C.gold, marginBottom:6 }}>~ A2 — Likely (post pattern)</div>
              No explicit tag, but a clear PATTERN across posts:<br />
              promotes <strong>≥2 DIFFERENT brands</strong> with CTAs/links<br />
              repeated product-review + link structure<br />
              brand giveaways ("RT + follow @X to win")<br /><br />
              Verdict requires <strong>quoted evidence</strong> — never a guess
            </InfoBox>
          </Row>

          {/* Detector signal tiers */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Paid-Post Signals (cheap regex scan, free — then AI confirms)
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
              {[
                ['Disclosure → A1', '#ad · #sponsored · "paid partnership" · "sponsored by"', C.green],
                ['Discount code → A2', '"use code SAVE20" · "20% off" · promo/coupon code', C.gold],
                ['Affiliate link → A2', '?ref= · utm_ · amzn.to · bit.ly · "link in bio to shop"', C.gold],
                ['Brand + CTA → A2', '@brand mention + "try / sign up / get yours / shop"', C.gold],
                ['Giveaway → A2', '"giveaway" · "RT + follow to win" · brand prize', C.gold],
                ['Distinct-brand count', '≥2 different brands promoted = serial-promoter pattern', C.purple],
              ].map(([label, ex, col]) => (
                <div key={label} style={{ background:C.bg, border:`1px solid ${col}33`, borderLeft:`3px solid ${col}`, borderRadius:6, padding:'8px 10px', fontSize:11 }}>
                  <div style={{ color:col, fontWeight:700, marginBottom:3 }}>{label}</div>
                  <div style={{ color:C.muted, fontFamily:'monospace', fontSize:10, lineHeight:1.5 }}>{ex}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'#0d1117', borderRadius:6, padding:'12px 14px', fontFamily:'monospace', fontSize:11, lineHeight:1.9, marginBottom:12 }}>
            <div style={{ color:C.red, marginBottom:6, fontWeight:700 }}>EXCLUSIONS — these are NOT hireable promoters (→ none / unknown):</div>
            <div style={{ paddingLeft:16, color:'#a5d6ff' }}>
              "Official Raycon Ambassador" / "Brand ambassador for X" → single-brand exclusive<br />
              Founder promoting only their OWN product → a brand, not for hire<br />
              Researcher / journalist / pure technical threads → organic, not paid<br />
            </div>
            <div style={{ color:C.gold, marginTop:10, marginBottom:6, fontWeight:700 }}>POST FETCH (when bio inconclusive — 20 original posts, RTs skipped):</div>
            <div style={{ paddingLeft:16, color:'#a5d6ff' }}>
              GET https://twitter241.p.rapidapi.com/search?query=from%3Ahasantoxr&count=20&type=Latest<br />
            </div>
            <div style={{ color:C.gold, marginTop:10, marginBottom:6, fontWeight:700 }}>QUALITY BACKSTOPS:</div>
            <div style={{ paddingLeft:16, color:'#a5d6ff' }}>
              A real #ad/#sponsored tag can NEVER be rated below A1 (regex override)<br />
              If the AI call fails → fall back to the regex signals<br />
              Still unresolved → saved as unknown (hidden from A1/A2 filter)<br />
              Stale unknown/none duplicates are re-checked on every refresh run<br />
            </div>
          </div>

          <InfoBox color={C.muted} style={{ fontSize:11 }}>
            <strong>DB sort order (Track A endpoint):</strong>{' '}
            <Code>ORDER BY CASE promotion_type WHEN 'explicit' THEN 0 WHEN 'inferred' THEN 1 ELSE 2 END, COALESCE(authenticity_score,-1) DESC, overall DESC</Code><br />
            A1 first → A2 (genuine first by authenticity) → Unknown. UI shows A1 / A2-Genuine / Salesy / Unscored chips.
          </InfoBox>
        </Card>

        <Arrow />

        {/* A2 AUTHENTICITY — genuine vs salesy */}
        <Card color={C.purple} title="A2 CONTENT AUTHENTICITY — Genuine Creators vs Salesy/Templated">
          <InfoBox color={C.purple} style={{ marginBottom: 14 }}>
            A2 is split by content quality so it stays a clean list of <strong>genuine creators</strong> whose
            product posts an audience would trust — not hyped-up ads or AI/templated spam. Every A2 account gets an
            <strong> authenticity score 0-100</strong> (Gemini reading 20 posts, blended 70% AI + 30% regex hint),
            with the single most genuine post quoted as evidence.
          </InfoBox>

          <Row gap={12} style={{ marginBottom: 14 }}>
            <InfoBox color={C.green} style={{ flex: 1 }}>
              <div style={{ fontWeight:700, color:C.green, marginBottom:6 }}>✦ Genuine (score ≥ 60) — RAISES</div>
              First-person lived experience ("I've been using…")<br />
              Specific details (features, timeframes, real use-case)<br />
              Honest/balanced (admits a downside)<br />
              Natural conversational voice + real reasoning
            </InfoBox>
            <InfoBox color={C.muted} style={{ flex: 1 }}>
              <div style={{ fontWeight:700, color:'#aaa', marginBottom:6 }}>⚠ Salesy (score &lt; 60) — LOWERS</div>
              Hype overload (ALL CAPS, 🚀🔥, "BEST EVER")<br />
              Generic / templated / interchangeable praise<br />
              Pure CTA / link-dump<br />
              Robotic, no personal voice (the low-weight "AI-ish" proxy)
            </InfoBox>
          </Row>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
            {[
              { t:'✦ A2 — Genuine', d:'inferred + score ≥ 60 — the clean curated list', c:C.green },
              { t:'◷ A2 — Unscored', d:'inferred + no score yet — run Resolve to score', c:C.gold },
              { t:'⚠ Salesy / Low', d:'inferred + score < 60 — separate bucket, nothing lost', c:'#888' },
            ].map(b => (
              <div key={b.t} style={{ background:C.bg, border:`1px solid ${b.c}44`, borderTop:`3px solid ${b.c}`, borderRadius:6, padding:'10px 12px' }}>
                <div style={{ color:b.c, fontWeight:700, fontSize:12, marginBottom:4 }}>{b.t}</div>
                <div style={{ color:C.muted, fontSize:11, lineHeight:1.5 }}>{b.d}</div>
              </div>
            ))}
          </div>

          <InfoBox color={C.muted} style={{ fontSize:11 }}>
            Threshold <Code>GENUINE_THRESHOLD = 60</Code> (backend + frontend). Stored as
            <Code>authenticity_score</Code> · <Code>authenticity_reason</Code> · <Code>authenticity_example</Code>.
            Sort within A2 = authenticity DESC, then overall. Per research, "AI-written" detection is deliberately
            a low-weight proxy — we score genuine-experience quality directly, which is more reliable.
          </InfoBox>
        </Card>

        <Arrow />

        {/* RESOLVE UNKNOWNS — backfill */}
        <Card color={C.purple} title="RESOLVE UNKNOWNS — On-Demand Backfill of the Unbadged Backlog">
          <InfoBox color={C.purple} style={{ marginBottom: 14 }}>
            Most accounts in the DB predate the paid-post detector and sit as <Code>unknown</Code>/<Code>none</Code>.
            The <strong>Resolve Unbadged Accounts</strong> button on the Track A page re-runs the detector over the
            entire backlog (relevant-first), promoting real promoters into A1/A2. Streams live progress.
          </InfoBox>
          <Row gap={12} style={{ marginBottom: 12 }}>
            <InfoBox color={C.blue} style={{ flex: 1 }}>
              <div style={{ fontWeight:700, color:C.blue, marginBottom:6 }}>How it runs</div>
              Endpoint: <Code>GET /api/resolve-unknowns</Code> (SSE)<br />
              Selects unknown/none to classify <strong>AND</strong> A2/A1 not yet authenticity-scored<br />
              For each: fetch 20 posts → detector → resolve type <strong>+ score authenticity</strong><br />
              Idempotent (scored accounts aren't re-picked) · 3 RPM · 5,000 cap · abortable.
            </InfoBox>
            <InfoBox color={C.green} style={{ flex: 1 }}>
              <div style={{ fontWeight:700, color:C.green, marginBottom:6 }}>Live tally (SSE)</div>
              <Code>start</Code> → total count<br />
              <Code>account</Code> → <Code>{'{ toA1, toA2, genuine, salesy, toNone, stillUnknown }'}</Code><br />
              <Code>complete</Code> → final summary, list reloads automatically<br />
              UI shows ✦ Genuine / ⚠ Salesy filling up live
            </InfoBox>
          </Row>
          <InfoBox color={C.gold} style={{ fontSize: 11 }}>
            <strong>Dashboard "Last Run Summary" card</strong> shows the most recent run's totals computed from
            <Code>accounts.run_id</Code>: fetched this run, new vs re-checked, and the A1 / A2 / Track B / Other split —
            accurate even if the run record never finalized.
          </InfoBox>
        </Card>

        <Arrow />

        {/* STEP 9 — DEDUPLICATION */}
        <Card color={C.green} step={9} title="DEDUPLICATION — seenThisRun + DB UNIQUE Constraint">
          <Row gap={16}>
            <InfoBox color={C.green} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.green }}>Within-Run Dedup</div>
              <Code>seenThisRun</Code> is a <Code>Set&lt;string&gt;</Code> (lowercased handles).<br />
              Created fresh at the start of each <Code>runAgent()</Code> call.<br />
              Prevents the same handle being fetched twice even across multiple search queries.<br />
              Direct handles (friend DB) are also checked against this Set.
            </InfoBox>
            <InfoBox color={C.blue} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.blue }}>Database Dedup</div>
              <Code>accounts.handle</Code> has a <Code>UNIQUE</Code> constraint.<br />
              <Code>upsertAccount()</Code> runs INSERT OR REPLACE (or equivalent).<br />
              Same account seen on a later run → scores updated, not re-inserted.<br />
              <Code>isDuplicate: true</Code> is set in the emitted <Code>account</Code> SSE event.<br />
              <Code>duplicatesSkipped</Code> counter incremented in the <Code>complete</Code> summary.
            </InfoBox>
          </Row>
        </Card>

        <Arrow />

        {/* STEP 10 — DATABASE WRITE */}
        <Card color={C.green} step={10} title="DATABASE WRITE — Turso (libSQL) Schema">
          <Row gap={16} style={{ marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 8, letterSpacing: 0.5 }}>
                ACCOUNTS TABLE (per account upserted)
              </div>
              <FieldGrid fields={[
                ['id', 'INTEGER PK', 'auto'],
                ['handle', 'TEXT UNIQUE', ''],
                ['name', 'TEXT', ''],
                ['bio', 'TEXT', ''],
                ['followers', 'INTEGER', ''],
                ['following', 'INTEGER', ''],
                ['tweets', 'INTEGER', ''],
                ['verified', 'INTEGER', '0/1'],
                ['avatar', 'TEXT', ''],
                ['website', 'TEXT', ''],
                ['location', 'TEXT', ''],
                ['joined_date', 'TEXT', ''],
                ['tier', 'TEXT', 'Macro/Mid/Micro/Nano'],
                ['account_type', 'TEXT', 'Influencer/PR Page…'],
                ['track', 'TEXT', 'A or B'],
                ['d1', 'REAL', 'reserved'],
                ['d2', 'REAL', 'collab intent'],
                ['d3', 'REAL', 'AI relevance'],
                ['d4', 'REAL', 'influence signals'],
                ['d5', 'REAL', 'reach'],
                ['overall', 'REAL', 'final score'],
                ['dm_open', 'INTEGER', '0/1'],
                ['has_email', 'INTEGER', '0/1'],
                ['contact_email', 'TEXT', ''],
                ['linktree', 'TEXT', ''],
                ['ai_model', 'TEXT', 'migration col'],
                ['ai_reason', 'TEXT', 'migration col'],
                ['promotion_type', 'TEXT', 'explicit/inferred/none'],
                ['promotion_signals', 'TEXT', 'JSON evidence'],
                ['authenticity_score', 'INTEGER', '0-100 A2 quality'],
                ['authenticity_reason', 'TEXT', 'why'],
                ['authenticity_example', 'TEXT', 'genuine post'],
                ['run_id', 'INTEGER FK', '→ runs.id'],
                ['first_seen', 'TEXT', ''],
                ['last_updated', 'TEXT', ''],
              ]} />
            </div>
            <div style={{ width: 220, flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 8, letterSpacing: 0.5 }}>
                OTHER TABLES
              </div>
              {[
                ['runs', 'One row per agent run. Stores started_at, completed_at, accounts_added, duplicates_skipped, status, triggered_by, keywords_used.'],
                ['keywords', 'Own keywords — id, keyword, category, class, active, source.'],
                ['agent_config', 'Key/value config — last_run, next_run, auto_run_enabled.'],
                ['users', 'Auth — id, email, password_hash, role.'],
              ].map(([name, desc]) => (
                <div key={name} style={{
                  marginBottom: 10,
                  padding: '8px 12px',
                  background: '#0d1117',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#79c0ff', marginBottom: 3 }}>{name}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </Row>
          <InfoBox color={C.gold}>
            <strong>Migration safety:</strong> Two ALTER TABLE migrations run on every startup
            (<Code>ADD COLUMN ai_model TEXT</Code>, <Code>ADD COLUMN ai_reason TEXT</Code>).
            "duplicate column" errors are silently swallowed — safe to re-deploy.
          </InfoBox>
        </Card>

        <Arrow />

        {/* STEP 11 — SSE EVENTS */}
        <Card color={C.blue} step={11} title="SSE EVENTS — Real-Time Browser Streaming">
          <InfoBox color={C.blue} style={{ marginBottom: 14 }}>
            The browser opens an <Code>EventSource</Code> on <Code>/api/agent/run</Code> (with JWT in query params).
            The server writes <Code>text/event-stream</Code>. <Code>retry:0</Code> is set to prevent
            auto-reconnect after completion. Raw <Code>{': ping\\n\\n'}</Code> comments are written every
            8s during rate-limit waits.
          </InfoBox>
          <div>
            <EventRow
              name="status"
              color={C.blue}
              when="Throughout the run: search start, per-profile fetch (progress 0–80%), AI batch scoring (80–95%), direct handle phase (95%), rate-pacing waits. Payload: { message, progress?, phase? }"
            />
            <EventRow
              name="search_done"
              color={C.green}
              when="After each query's search API call succeeds. Payload: { query, found, fetching, handles[], tweets_returned, duration_ms }"
            />
            <EventRow
              name="health"
              color={C.blue}
              when="After every search result and after each profile fetch. Payload: { status, strength, color, avgMs, successRate, calls, successes, errors, durations, key_stats }"
            />
            <EventRow
              name="account"
              color={C.green}
              when="After each account is upserted. Payload: { account { ...all DB fields, isDuplicate, index, total }, health, durations }. Direct handle accounts add source: 'friend_list'."
            />
            <EventRow
              name="fetch_error"
              color={C.red}
              when="When a screenname.php call fails for a handle. Payload: { handle, index, total, status, error, health }"
            />
            <EventRow
              name="error"
              color={C.red}
              when="When a search API call fails for a query. Payload: { step, message, status }"
            />
            <EventRow
              name="quota_exhausted"
              color={C.red}
              when="When globalConsecutive429 >= 3 across all keys (QuotaExhaustedError caught). Payload: { message }. Run stops immediately."
            />
            <EventRow
              name="complete"
              color={C.green}
              when="At end of run (success or quota). Payload: { runId, accountsAdded, duplicatesSkipped, errors, quotaExhausted, health }. runs row updated with final status."
            />
          </div>
        </Card>

        <Arrow />

        {/* STEP 12 — API ENDPOINTS */}
        <Card color={C.purple} step={12} title="API ENDPOINTS — All Backend Routes">
          {/* Auth */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, margin: '0 0 8px', letterSpacing: 0.5 }}>AUTH</div>
          <RouteRow method="POST" path="/api/auth/login" auth={false} returns="{ token, user: { id, email, role } } — JWT, 7d expiry" />
          <RouteRow method="GET"  path="/api/auth/me"    auth={true}  returns="{ id, email, role } from JWT payload" />
          <RouteRow method="POST" path="/api/auth/register" auth={false} returns="Always 403 — registration disabled" />

          {/* Accounts */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, margin: '16px 0 8px', letterSpacing: 0.5 }}>ACCOUNTS</div>
          <RouteRow method="GET" path="/api/pr/accounts" auth={true}
            returns="{ accounts[], total } — filters: track, type, tier, min_score, limit(1000), offset(0). Note: total is unfiltered count." />
          <RouteRow method="GET" path="/api/pr/accounts/influencers" auth={true}
            returns="{ accounts[] } — track='A', overall DESC, LIMIT 1000" />
          <RouteRow method="GET" path="/api/pr/accounts/pr-pages" auth={true}
            returns="{ accounts[] } — track='B', overall DESC, LIMIT 1000" />
          <RouteRow method="GET" path="/api/pr/accounts/promotion-stats" auth={true}
            returns="{ a1, a2, none, unknown, a2_genuine, a2_salesy, a2_unscored, resolvable, threshold }" />
          <RouteRow method="DELETE" path="/api/pr/accounts/cleanup" auth={true}
            returns="Deletes overall<20 AND d3<15 → { deleted, remaining }" />
          <RouteRow method="GET" path="/api/pr/accounts/:handle" auth={true}
            returns="{ account } or 404 — handle lowercased before lookup" />

          {/* Dashboard */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, margin: '16px 0 8px', letterSpacing: 0.5 }}>DASHBOARD</div>
          <RouteRow method="GET" path="/api/pr/dashboard/stats" auth={true}
            returns="{ totals, byType, byTier, byTrack, topAccounts, recentRuns, config }" />
          <RouteRow method="GET" path="/api/pr/dashboard/last-run" auth={true}
            returns="{ lastRun: { totalFetched, newAccounts, updatedAccounts, a1, a2, trackB, other } } — from run_id" />
          <RouteRow method="GET" path="/api/resolve-unknowns" auth={true}
            returns="text/event-stream — classifies unknown/none + scores A2 authenticity. Live A1/A2/genuine/salesy tally." />

          {/* Keywords */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.green, margin: '16px 0 8px', letterSpacing: 0.5 }}>KEYWORDS</div>
          <RouteRow method="GET"    path="/api/pr/keywords"           auth={true}  returns="All keywords ordered by class, category, keyword" />
          <RouteRow method="POST"   path="/api/pr/keywords"           auth={true}  returns="Add keyword { keyword, category?, class? } → 409 if duplicate" />
          <RouteRow method="PATCH"  path="/api/pr/keywords/:id"       auth={true}  returns="Toggle active flag { active: bool }" />
          <RouteRow method="DELETE" path="/api/pr/keywords/:id"       auth={true}  returns="Permanently delete keyword by ID" />
          <RouteRow method="GET"    path="/api/pr/keywords/friend"    auth={true}  returns="{ classes, keywords, influencers, totals } from read-only friend DB" />

          {/* Settings */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, margin: '16px 0 8px', letterSpacing: 0.5 }}>SETTINGS</div>
          <RouteRow method="GET"   path="/api/pr/settings"                  auth={true}  returns="Non-sensitive agent_config rows + runtime flags (openrouter_env_set, model_chain, db_url, safe_rpm, friend_db_set)" />
          <RouteRow method="GET"   path="/api/pr/settings/keys"             auth={true}  returns="Live RapidAPI key status (no key values exposed)" />
          <RouteRow method="POST"  path="/api/pr/settings/keys/test"        auth={true}  returns="Per-key live test result: ok | quota_exhausted | not_subscribed | invalid_key | error" />
          <RouteRow method="POST"  path="/api/pr/settings/test-openrouter"  auth={true}  returns="{ ok, model, response } or 502 — fires live test prompt via OpenRouter" />
          <RouteRow method="GET"   path="/api/pr/settings/test-friend-db"   auth={true}  returns="{ ok, keywordCount, influencerCount } — tests read-only friend Turso connection" />
          <RouteRow method="PATCH" path="/api/pr/settings/:configKey"       auth={true}  returns="Upserts agent_config value — blocks openrouter/jwt/turso/rapidapi keys" />

          {/* Agent */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, margin: '16px 0 8px', letterSpacing: 0.5 }}>AGENT</div>
          <RouteRow method="GET" path="/api/agent/run" auth={true}
            returns="text/event-stream — starts runAgent(), streams SSE events. retry:0 prevents auto-reconnect." />
          <RouteRow method="GET" path="/api/agent/status" auth={true}
            returns="{ running, runId?, startedAt? } — whether an agent run is currently active" />
          <RouteRow method="POST" path="/api/agent/stop" auth={true}
            returns="Signals abort to running agent via isAborted flag — graceful stop" />

          <div style={{ marginTop: 14 }}>
            <Row gap={10}>
              <Tag color={C.gold}>JWT req.</Tag>
              <span style={{ fontSize: 11, color: C.muted }}>= Bearer token in Authorization header (all protected routes)</span>
            </Row>
            <Row gap={10} style={{ marginTop: 6 }}>
              <Tag color={C.green}>public</Tag>
              <span style={{ fontSize: 11, color: C.muted }}>= No auth needed (only /api/auth/login)</span>
            </Row>
          </div>
        </Card>

      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div style={{
        marginTop: 40,
        paddingTop: 20,
        borderTop: `1px solid ${C.border}`,
        fontSize: 11,
        color: C.muted,
        textAlign: 'center',
      }}>
        KiteAI X Agent — Backend Workflow Reference — Generated from source
      </div>
    </div>
  );
}
