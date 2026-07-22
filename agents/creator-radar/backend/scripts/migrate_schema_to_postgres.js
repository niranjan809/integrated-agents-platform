import { Client } from 'pg';
import fs from 'fs/promises';
import 'dotenv/config';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const schema = await fs.readFile('db/schema.postgres.sql', 'utf-8');

await client.connect();
console.log('Connected to', (await client.query('SELECT current_database()')).rows[0].current_database);

// Execute the entire schema as one transaction
try {
  await client.query('BEGIN');
  await client.query(schema);
  await client.query('COMMIT');
  console.log('Schema created successfully.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Schema creation failed, rolled back:', err.message);
  throw err;
}

// Verify tables exist
const tables = await client.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`);
console.log('Tables in creator_radar:');
tables.rows.forEach(t => console.log(' -', t.tablename));

await client.end();
