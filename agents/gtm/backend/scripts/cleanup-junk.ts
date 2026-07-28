import "dotenv/config";
import { createClient } from "@libsql/client";
import { config } from "../src/config.js";
import { KNOWN_COMPANIES } from "../src/knownCompanies.js";

const db = createClient({ url: config.dbUrl, authToken: config.dbAuthToken });
const knownNames = KNOWN_COMPANIES.map((c) => c.name.toLowerCase());

const all = await db.execute("SELECT id, name FROM companies");
const junk = all.rows.filter((r) => !knownNames.includes(String(r.name).toLowerCase()));

for (const row of junk) {
  const id = row.id as string;
  await db.execute({ sql: "DELETE FROM evidence WHERE company_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM gtm_strategies WHERE company_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM scrape_jobs WHERE company_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM companies WHERE id = ?", args: [id] });
  console.log(`Deleted junk company: ${row.name} (${id})`);
}

// Also clear any bad evidence/jobs for the known companies picked up before the
// discovery fix (e.g. Vapi resolved to the parked vapi.com), so seed() re-runs clean.
for (const known of KNOWN_COMPANIES) {
  const res = await db.execute({
    sql: "SELECT id, website FROM companies WHERE lower(name) = lower(?)",
    args: [known.name],
  });
  for (const row of res.rows) {
    const id = row.id as string;
    if (row.website !== known.website) {
      await db.execute({ sql: "DELETE FROM evidence WHERE company_id = ?", args: [id] });
      await db.execute({ sql: "DELETE FROM gtm_strategies WHERE company_id = ?", args: [id] });
      await db.execute({ sql: "DELETE FROM scrape_jobs WHERE company_id = ?", args: [id] });
      await db.execute({
        sql: "UPDATE companies SET website = ?, status = 'pending', updated_at = ? WHERE id = ?",
        args: [known.website, new Date().toISOString(), id],
      });
      console.log(`Reset ${known.name} to correct website ${known.website} and cleared stale evidence`);
    }
  }
}

// Dedupe: keep only the earliest row per known company name.
for (const known of KNOWN_COMPANIES) {
  const res = await db.execute({
    sql: "SELECT id FROM companies WHERE lower(name) = lower(?) ORDER BY created_at ASC",
    args: [known.name],
  });
  const duplicates = res.rows.slice(1);
  for (const row of duplicates) {
    const id = row.id as string;
    await db.execute({ sql: "DELETE FROM evidence WHERE company_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM gtm_strategies WHERE company_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM scrape_jobs WHERE company_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM companies WHERE id = ?", args: [id] });
    console.log(`Deleted duplicate ${known.name} (${id})`);
  }
}

console.log("Cleanup done.");
