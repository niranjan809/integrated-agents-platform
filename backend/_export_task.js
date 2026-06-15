require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { db } = require('./db');

const GENUINE_THRESHOLD = 60;
const REPOST_THRESHOLD  = Math.max(1, Math.min(100, Number(process.env.REPOST_THRESHOLD) || 60));
const FILTER = (process.argv[2] || 'perplex').toLowerCase();

function bucketOf(a) {
  if (a.repost_ratio != null && a.repost_ratio >= REPOST_THRESHOLD) return 'Reposters';
  if (a.track === 'B') return 'Track B (ads)';
  if (a.promotion_type === 'explicit') return 'A1 Confirmed';
  if (a.promotion_type === 'inferred') {
    if (a.authenticity_score == null)                 return 'A2 Unscored';
    return a.authenticity_score >= GENUINE_THRESHOLD ? 'A2 Genuine' : 'Salesy Low';
  }
  return 'Other (unbadged)';
}

function row(a, basket) {
  return {
    Basket: basket, Handle: '@' + a.handle, Name: a.name || '', Followers: a.followers || 0,
    Tier: a.tier || '', Type: a.account_type || '', Track: a.track || '', Score: a.overall ?? '',
    'D2 Collab': a.d2 ?? '', 'D3 AI-Rel': a.d3 ?? '', 'D4 Authority': a.d4 ?? '', 'D5 Reach': a.d5 ?? '',
    Promotion: a.promotion_type || '', 'Promo Conf': a.promotion_confidence ?? '',
    Authenticity: a.authenticity_score ?? '', 'Repost %': a.repost_ratio ?? '',
    'Auth Reason': a.authenticity_reason || '',
    'Auth Example': a.authenticity_example || '', DM_Open: a.dm_open ? 'Yes' : '',
    Has_Email: a.has_email ? 'Yes' : '', Contact_Email: a.contact_email || '', Website: a.website || '',
    Bio: (a.bio || '').replace(/\s+/g, ' ').slice(0, 300), 'X URL': 'https://x.com/' + a.handle,
  };
}

(async () => {
  const { rows: tasks } = await db.execute({
    sql: `SELECT * FROM tasks WHERE LOWER(name) LIKE ? OR LOWER(company) LIKE ? ORDER BY id DESC LIMIT 1`,
    args: [`%${FILTER}%`, `%${FILTER}%`],
  });
  if (!tasks.length) { console.error(`No task matching "${FILTER}". Run it first, or pass a different name.`); process.exit(1); }
  const task = tasks[0];
  console.log(`Task #${task.id}: ${task.name} (${task.company || '-'}) · status=${task.status}`);

  const { rows } = await db.execute({
    sql: `SELECT a.handle, a.name, a.bio, a.followers, a.verified, a.tier, a.account_type, a.track,
                 a.overall, a.d2, a.d3, a.d4, a.d5, a.dm_open, a.has_email, a.contact_email, a.website,
                 a.promotion_type, a.promotion_confidence, a.authenticity_score, a.authenticity_reason, a.authenticity_example, a.repost_ratio
          FROM task_accounts ta JOIN accounts a ON a.handle = ta.handle
          WHERE ta.task_id = ?
          ORDER BY CASE a.promotion_type WHEN 'explicit' THEN 0 WHEN 'inferred' THEN 1 ELSE 2 END,
                   COALESCE(a.authenticity_score, -1) DESC, a.overall DESC`,
    args: [task.id],
  });

  const groups = { 'A1 Confirmed': [], 'A2 Genuine': [], 'Salesy Low': [], 'A2 Unscored': [] };
  const reposters = [];
  const all = [];
  for (const a of rows) {
    const b = bucketOf(a);
    if (b === 'Reposters') reposters.push(row(a, b));
    else if (groups[b]) { groups[b].push(row(a, b)); all.push(row(a, b)); }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all.length ? all : [{ Note: 'no accounts in the 4 baskets yet' }]), 'All 4 Baskets');
  for (const [name, list] of Object.entries(groups)) {
    const ws = list.length ? XLSX.utils.json_to_sheet(list) : XLSX.utils.aoa_to_sheet([['(none yet)']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  // Reposters / amplifiers — pulled out of the 4 baskets, shown separately
  XLSX.utils.book_append_sheet(wb,
    reposters.length ? XLSX.utils.json_to_sheet(reposters) : XLSX.utils.aoa_to_sheet([['(no reposters detected yet)']]),
    'Reposters');

  const safe = task.name.replace(/[^a-z0-9]+/gi, '_');
  const out = path.join(__dirname, '..', `KiteAI_${safe}_Baskets.xlsx`);
  XLSX.writeFile(wb, out);

  console.log(`\nLinked accounts: ${rows.length}`);
  for (const [name, list] of Object.entries(groups)) console.log(`  ${name.padEnd(14)} : ${list.length}`);
  console.log(`  ${'TOTAL (4)'.padEnd(14)} : ${all.length}`);
  console.log(`  ${'Reposters'.padEnd(14)} : ${reposters.length}`);
  console.log(`\nSaved: ${out}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
