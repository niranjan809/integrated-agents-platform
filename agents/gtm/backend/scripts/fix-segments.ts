import "dotenv/config";
import { createClient } from "@libsql/client";
import { config } from "../src/config.js";
import { KNOWN_COMPANIES } from "../src/knownCompanies.js";

const db = createClient({ url: config.dbUrl, authToken: config.dbAuthToken });

for (const known of KNOWN_COMPANIES) {
  await db.execute({
    sql: "UPDATE companies SET segment = ? WHERE lower(name) = lower(?) AND (segment IS NULL OR segment = '')",
    args: [known.segment, known.name],
  });
}
console.log("Segments fixed.");
