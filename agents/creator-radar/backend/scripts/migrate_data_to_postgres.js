import { createClient } from '@libsql/client';
import { Client } from 'pg';
import 'dotenv/config';

const sqlite = createClient({ url: 'file:./db/creator_radar.db' });
const pg = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

await pg.connect();

// Utility to convert SQLite int 0/1 to Postgres boolean
const toBool = (v) => v === null || v === undefined ? null : Boolean(v);

const migrateTable = async (tableName, transformer) => {
  const { rows } = await sqlite.execute(`SELECT * FROM ${tableName}`);
  console.log(`\n${tableName}: ${rows.length} rows to migrate`);

  if (rows.length === 0) return { count: 0 };

  await pg.query('BEGIN');
  try {
    let inserted = 0;
    for (const row of rows) {
      const record = transformer(row);
      const columns = Object.keys(record);
      const values = Object.values(record);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const columnList = columns.join(', ');

      await pg.query(
        `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
        values
      );
      inserted++;

      if (inserted % 100 === 0) console.log(`  ${inserted}/${rows.length}...`);
    }
    await pg.query('COMMIT');
    console.log(`  ${tableName}: ${inserted} rows committed`);
    return { count: inserted };
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error(`  ${tableName} FAILED, rolled back:`, err.message);
    throw err;
  }
};

// Table-specific transformers to handle type conversions
const accountsTransformer = (row) => ({
  ...row,
  is_verified: toBool(row.is_verified),
  is_business_account: toBool(row.is_business_account)
});

const candidateAccountsTransformer = (row) => ({
  ...row,
  is_verified: toBool(row.is_verified)
});

const identityTransformer = (row) => ({ ...row });

// Migrate in dependency order
await migrateTable('accounts', accountsTransformer);
await migrateTable('posts', identityTransformer);
await migrateTable('classifications', identityTransformer);
await migrateTable('candidate_accounts', candidateAccountsTransformer);
await migrateTable('api_calls', identityTransformer);
await migrateTable('users', identityTransformer);
await migrateTable('sessions', identityTransformer);
await migrateTable('curator_actions', identityTransformer);

// Post-migration verification
console.log('\n=== POST-MIGRATION ROW COUNTS ===');
for (const table of ['accounts', 'posts', 'classifications', 'candidate_accounts', 'api_calls', 'users', 'sessions', 'curator_actions']) {
  const sqliteCount = (await sqlite.execute(`SELECT COUNT(*) as c FROM ${table}`)).rows[0].c;
  const pgCount = (await pg.query(`SELECT COUNT(*) as c FROM ${table}`)).rows[0].c;
  const status = String(sqliteCount) === String(pgCount) ? 'OK ' : 'XX ';
  console.log(`${status} ${table}: sqlite=${sqliteCount}, postgres=${pgCount}`);
}

// Sequence reset for SERIAL columns (Postgres needs this after we've inserted rows with explicit IDs)
console.log('\n=== RESETTING SERIAL SEQUENCES ===');
for (const table of ['classifications', 'api_calls', 'candidate_accounts', 'users', 'curator_actions']) {
  const result = await pg.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`);
  console.log(`  ${table} sequence reset to ${result.rows[0].setval}`);
}

await pg.end();
sqlite.close();
console.log('\nMigration complete.');
