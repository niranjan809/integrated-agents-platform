// Candidate discovery report. Groups candidate_accounts by discovered_via and shows,
// per seed: discovered / accepted / rejected (with reject-reason breakdown), fetched,
// promoted, and — for fetched accounts — predicted category + genuineness (latest
// classification per handle). Read-only, no API calls.
import { all } from "../src/db.js";

const reasonKey = (reason) => (reason || "?").split(/[:[]/)[0].trim();

const seeds = (await all("SELECT DISTINCT discovered_via FROM candidate_accounts ORDER BY discovered_via")).map(
  (r) => r.discovered_via
);

if (seeds.length === 0) {
  console.log("No candidates discovered yet — run `npm run discover` first.");
} else {
  const grand = (await all("SELECT COUNT(*) AS n FROM candidate_accounts"))[0].n;
  console.log(`\n=== Candidate discovery report ===`);
  console.log(`Total candidates: ${grand} across ${seeds.length} seed(s)\n`);

  for (const seed of seeds) {
    const rows = await all("SELECT * FROM candidate_accounts WHERE discovered_via = @s ORDER BY id", { s: seed });
    const accepted = rows.filter((r) => r.prefilter_verdict === "accept");
    const rejected = rows.filter((r) => r.prefilter_verdict === "reject");
    const fetched = rows.filter((r) => r.fetch_status === "fetched");
    const fetchedEmpty = rows.filter((r) => r.fetch_status === "fetched_empty");
    const failed = rows.filter((r) => r.fetch_status === "failed");
    const promoted = rows.filter((r) => r.promoted_to_accounts === 1);

    const reasonTally = {};
    for (const r of rejected) {
      const k = reasonKey(r.prefilter_reason);
      reasonTally[k] = (reasonTally[k] || 0) + 1;
    }

    console.log(`seed "${seed}"`);
    console.log(`  discovered ${rows.length} | accepted ${accepted.length} | rejected ${rejected.length} | fetched ${fetched.length} | empty ${fetchedEmpty.length} | failed ${failed.length} | promoted ${promoted.length}`);
    console.log(`  reject reasons: ${JSON.stringify(reasonTally)}`);
    if (fetchedEmpty.length) console.log(`  fetched_empty (0 posts, not promoted): ${fetchedEmpty.map((r) => "@" + r.handle).join(", ")}`);

    // Accepted-but-not-yet-fetched (the fetch queue for this seed).
    const queued = accepted.filter((r) => !r.fetch_status);
    if (queued.length) console.log(`  queued for fetch: ${queued.map((r) => "@" + r.handle).join(", ")}`);

    // Fetched accounts + their latest classification.
    if (fetched.length) {
      console.log(`  fetched + classified:`);
      for (const r of fetched) {
        const c = await all(
          "SELECT category, genuineness FROM classifications WHERE handle=@h ORDER BY id DESC LIMIT 1",
          { h: r.handle }
        );
        const label = c[0] ? `${c[0].category} / ${c[0].genuineness}` : "(not classified yet)";
        console.log(`    @${r.handle}: ${label}`);
      }
    }
    console.log("");
  }
}
