import { Client } from 'pg';
import 'dotenv/config';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

// Do NOT log the URL (contains password). Log only that it exists.
console.log('DATABASE_URL is set:', url.substring(0, 20) + '...');
console.log('SSL mode:', process.env.DATABASE_SSL);

const client = new Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

try {
  console.log('Attempting connection...');
  await client.connect();
  console.log('Connected successfully.');

  const result = await client.query('SELECT current_database(), current_user, version()');
  console.log('Current database:', result.rows[0].current_database);
  console.log('Current user:', result.rows[0].current_user);
  console.log('Postgres version:', result.rows[0].version.substring(0, 50) + '...');

  // Confirm we're in the right DB
  if (result.rows[0].current_database !== 'creator_radar') {
    console.warn('WARNING: connected to', result.rows[0].current_database, 'not creator_radar');
  }

  // Test write permissions
  await client.query('CREATE TABLE IF NOT EXISTS _write_test (id INT, created_at TIMESTAMP DEFAULT now())');
  await client.query('INSERT INTO _write_test (id) VALUES (1)');
  const testRead = await client.query('SELECT COUNT(*) FROM _write_test');
  console.log('Write test row count:', testRead.rows[0].count);
  await client.query('DROP TABLE _write_test');
  console.log('Write + read + drop: OK');

  await client.end();
  console.log('Disconnected cleanly. All checks passed.');
} catch (err) {
  console.error('Connection or query error:');
  console.error(err.message);
  console.error('Full error:', err);
  process.exit(1);
}
