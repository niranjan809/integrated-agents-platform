// Monthly API-call budget. Every external call is recorded in api_calls and gated
// against API_BUDGET_MONTHLY, enforced per-provider. Callers MUST `await canCall()`
// before a request and `await recordCall()` after. (Async — backed by Turso.)
import { run, get, nowIso } from "./db.js";
import { config } from "./config.js";

// Start-of-month as an ISO string. called_at is stored ISO 8601 (UTC), which sorts
// lexicographically, so a string >= comparison is a correct "this month" filter.
function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function monthlyCount(provider = "rapidapi") {
  const row = await get(
    "SELECT COUNT(*) AS n FROM api_calls WHERE provider = @provider AND called_at >= @since",
    { provider, since: monthStartIso() }
  );
  return row.n;
}

// Monthly cap per provider. tiktok_rapidapi has its own (larger, free-tier) budget;
// rapidapi (Instagram) + openrouter share API_BUDGET_MONTHLY.
export function capFor(provider) {
  return provider === "tiktok_rapidapi" ? config.tiktokApiBudgetMonthly : config.apiBudgetMonthly;
}

// True if another call to `provider` this month stays within its cap.
export async function canCall(provider = "rapidapi") {
  return (await monthlyCount(provider)) < capFor(provider);
}

export async function recordCall({ provider, endpoint = null, handle = null, status = null, platform = "instagram" }) {
  await run(
    `INSERT INTO api_calls (provider, endpoint, handle, status, platform, called_at)
     VALUES (@provider, @endpoint, @handle, @status, @platform, @called_at)`,
    { provider, endpoint, handle, status, platform, called_at: nowIso() }
  );
}

export async function printStatus() {
  const cap = config.apiBudgetMonthly;
  const rapid = await monthlyCount("rapidapi");
  const openrouter = await monthlyCount("openrouter");
  const tiktok = await monthlyCount("tiktok_rapidapi");
  const ttCap = config.tiktokApiBudgetMonthly;
  console.log(`API budget (this month):`);
  console.log(`  rapidapi:        ${rapid} / ${cap} used  (${cap - rapid} remaining)`);
  console.log(`  openrouter:      ${openrouter} / ${cap} used  (${cap - openrouter} remaining)`);
  console.log(`  tiktok_rapidapi: ${tiktok} / ${ttCap} used  (${ttCap - tiktok} remaining)`);
}
