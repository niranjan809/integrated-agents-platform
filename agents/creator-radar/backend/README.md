# Creator Radar
Multi-platform AI creator intelligence catalog. Instagram and TikTok discovery, classification, and tracking.

## Current state
- Instagram: 52 accounts across 4 seeds, classified with hybrid rule + LLM pipeline
- TikTok: coming (multi-platform expansion in progress)
- Dashboard: local demo on Vite + React + Tailwind, multi-user auth
- Backend: Fastify on Turso

## Setup
See .env.example for required environment variables. Run npm install at repo root and in dashboard/. See CLAUDE.md for detailed component docs.

## Curator CLI (v0.12)
Operator scripts for catalog maintenance. Every mutation is audited to the `curator_actions` table. See docs/architecture.md § 7.5 for full detail.

```
npm run search:adhoc  -- --query "voice ai mumbai" --platform instagram   # explore (read-only, IG)
npm run keyword:add   -- --hashtag X --tier T1 [--sub-cluster ".." --notes ".." --force]
npm run keyword:remove -- --hashtag X --reason "..."                        # soft-remove
npm run account:add   -- --handle X --platform instagram --reason "..."     # fetch+gate+classify
npm run account:remove -- --handle X --platform instagram --reason "..."    # cascade delete (prompts; --yes to skip)
```

Schema migration for the audit table: `node scripts/migrate_curator_actions.js` (idempotent).
