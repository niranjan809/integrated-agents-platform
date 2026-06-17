// Read-only connection to the FRIEND's (KA017) Turso database — a SEPARATE DB from
// ours. Configured via KA_TURSO_URL + KA_TURSO_TOKEN (ideally a read-only token).
// If those env vars aren't set, kaDb is null and the /api/ka routes report
// { configured: false } so the UI shows a setup hint instead of erroring.
const { createClient } = require('@libsql/client');

const KA_URL   = process.env.KA_TURSO_URL;
const KA_TOKEN = process.env.KA_TURSO_TOKEN;

let kaDb = null;
if (KA_URL && KA_TOKEN) {
  try { kaDb = createClient({ url: KA_URL, authToken: KA_TOKEN }); }
  catch (e) { console.error('[KA] failed to create client:', e.message); }
}

module.exports = { kaDb, kaConfigured: !!kaDb };
