require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { db } = require('./db');

const GENUINE_THRESHOLD = 60;
const REPOST_THRESHOLD  = Math.max(1, Math.min(100, Number(process.env.REPOST_THRESHOLD) || 60));

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

// One flat row per account for the spreadsheet
function row(a, basket) {
  return {
    Basket:        basket,
    Handle:        '@' + a.handle,
    Name:          a.name || '',
    Followers:     a.followers || 0,
    Tier:          a.tier || '',
    Type:          a.account_type || '',
    Track:         a.track || '',
    Score:         a.overall ?? '',
    'D2 Collab':   a.d2 ?? '',
    'D3 AI-Rel':   a.d3 ?? '',
    'D4 Authority':a.d4 ?? '',
    'D5 Reach':    a.d5 ?? '',
    Promotion:     a.promotion_type || '',
    'Promo Conf':  a.promotion_confidence ?? '',
    Authenticity:  a.authenticity_score ?? '',
    'Repost %':    a.repost_ratio ?? '',
    'Auth Reason': a.authenticity_reason || '',
    'Auth Example':a.authenticity_example || '',
    DM_Open:       a.dm_open ? 'Yes' : '',
    Has_Email:     a.has_email ? 'Yes' : '',
    Contact_Email: a.contact_email || '',
    Website:       a.website || '',
    Bio:           (a.bio || '').replace(/\s+/g, ' ').slice(0, 300),
    'X URL':       'https://x.com/' + a.handle,
  };
}

(async () => {
  const { rows } = await db.execute(`
    SELECT handle, name, bio, followers, verified, tier, account_type, track,
           overall, d2, d3, d4, d5, dm_open, has_email, contact_email, website,
           promotion_type, promotion_confidence, authenticity_score, authenticity_reason, authenticity_example, repost_ratio
    FROM accounts
    ORDER BY CASE promotion_type WHEN 'explicit' THEN 0 WHEN 'inferred' THEN 1 ELSE 2 END,
             COALESCE(authenticity_score, -1) DESC, overall DESC`);

  // Group into the four primary baskets (+ secondary)
  const groups = { 'A1 Confirmed': [], 'A2 Genuine': [], 'Salesy Low': [], 'A2 Unscored': [] };
  const reposters = [];
  const all = [];
  for (const a of rows) {
    const b = bucketOf(a);
    if (b === 'Reposters') reposters.push(row(a, b));
    else if (groups[b]) { groups[b].push(row(a, b)); all.push(row(a, b)); }
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: all four baskets together (with a Basket column to filter on)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all), 'All 4 Baskets');

  // One sheet per basket
  for (const [name, list] of Object.entries(groups)) {
    const ws = list.length ? XLSX.utils.json_to_sheet(list)
                           : XLSX.utils.aoa_to_sheet([['(no accounts in this basket yet)']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  // Reposters / amplifiers — pulled out of the 4 baskets, shown separately
  XLSX.utils.book_append_sheet(wb,
    reposters.length ? XLSX.utils.json_to_sheet(reposters) : XLSX.utils.aoa_to_sheet([['(no reposters detected yet)']]),
    'Reposters');

  const out = path.join(__dirname, '..', 'KiteAI_Accounts_Baskets.xlsx');
  XLSX.writeFile(wb, out);

  console.log('\nBasket counts:');
  for (const [name, list] of Object.entries(groups)) console.log(`  ${name.padEnd(14)} : ${list.length}`);
  console.log(`  ${'TOTAL (4)'.padEnd(14)} : ${all.length}`);
  console.log(`  ${'Reposters'.padEnd(14)} : ${reposters.length}`);
  console.log(`\nSaved: ${out}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
