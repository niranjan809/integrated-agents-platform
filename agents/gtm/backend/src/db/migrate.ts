import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { db } from "./client.js";
import { DEFAULT_GTM_CATEGORIES } from "../types.js";
import * as promptsRepo from "./prompts.repo.js";
import {
  GTM_CLASSIFICATION_KEY,
  COMPANY_SCOPE_KEY,
  COMPANY_SEGMENT_KEY,
  COMPANY_COUNTRY_KEY,
  DEFAULT_GTM_CLASSIFICATION_TEMPLATE,
  DEFAULT_COMPANY_SCOPE_TEMPLATE,
  DEFAULT_COMPANY_SEGMENT_TEMPLATE,
  DEFAULT_COMPANY_COUNTRY_TEMPLATE,
} from "../classifier/defaultPrompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  // Strip "-- ..." line comments before splitting on ";" — a semicolon inside
  // a comment (e.g. in prose) would otherwise be mistaken for a statement
  // boundary and corrupt the following CREATE TABLE.
  const withoutComments = sql.replace(/--.*$/gm, "");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.execute(statement);
  }

  await addColumnIfMissing("detection_rules", "company_id", "TEXT");
  await addColumnIfMissing("companies", "scope", "TEXT");
  await addColumnIfMissing("companies", "hq_country", "TEXT");
  await dropColumnIfExists("companies", "discovered");
  await seedDefaultCategories();
  await ensureCategory("Buyer Persona Targeting");
  await ensureCategory("Open-Source & Open-Weights GTM");
  await seedDefaultPrompts();
  await collapseScopeToTwoValues();
  await removeOrphanedDiscoveryPrompts();
}

// One-time cleanup: the auto-discovery feature (and its "discovered" column,
// candidate-screening/listicle-extraction prompts) was removed after being
// tried — these keys would otherwise sit in the prompts table forever,
// editable in the Prompts page, doing nothing.
async function removeOrphanedDiscoveryPrompts(): Promise<void> {
  await db.execute({
    sql: "DELETE FROM prompts WHERE key IN (?, ?)",
    args: ["company_discovery_candidate", "company_discovery_listicle"],
  });
}

/** CompanyScope was narrowed from 4 values (Global/Regional/National/Local)
 *  to 2 (Global/Regional) — normalize any rows still holding the old
 *  narrower values instead of leaving stale data the frontend no longer
 *  has styling for. */
async function collapseScopeToTwoValues(): Promise<void> {
  await db.execute("UPDATE companies SET scope = 'Regional' WHERE scope IN ('National', 'Local')");
}

async function seedDefaultPrompts(): Promise<void> {
  await promptsRepo.insertIfMissing(GTM_CLASSIFICATION_KEY, "GTM Evidence Classification", DEFAULT_GTM_CLASSIFICATION_TEMPLATE);
  await promptsRepo.insertIfMissing(COMPANY_SCOPE_KEY, "Company Geographic Scope", DEFAULT_COMPANY_SCOPE_TEMPLATE);
  await promptsRepo.insertIfMissing(COMPANY_SEGMENT_KEY, "Company Product Segment", DEFAULT_COMPANY_SEGMENT_TEMPLATE);
  await promptsRepo.insertIfMissing(COMPANY_COUNTRY_KEY, "Company Headquarters Country", DEFAULT_COMPANY_COUNTRY_TEMPLATE);
}

/** Idempotently adds a single category by name — for categories introduced
 *  after the initial seed, which seedDefaultCategories (empty-table-only)
 *  won't backfill. Targeted by name so it never resurrects one of the
 *  original defaults a user may have deliberately deleted. */
async function ensureCategory(name: string): Promise<void> {
  const result = await db.execute({
    sql: "SELECT COUNT(*) as count FROM gtm_categories WHERE name = ?",
    args: [name],
  });
  const count = Number((result.rows[0] as unknown as { count: number }).count);
  if (count > 0) return;
  await db.execute({
    sql: "INSERT INTO gtm_categories (id, name, created_at) VALUES (?, ?, ?)",
    args: [randomUUID(), name, new Date().toISOString()],
  });
}

async function seedDefaultCategories(): Promise<void> {
  const existing = await db.execute("SELECT COUNT(*) as count FROM gtm_categories");
  const count = Number((existing.rows[0] as unknown as { count: number }).count);
  if (count > 0) return;

  const now = new Date().toISOString();
  for (const name of DEFAULT_GTM_CATEGORIES) {
    await db.execute({
      sql: "INSERT INTO gtm_categories (id, name, created_at) VALUES (?, ?, ?)",
      args: [randomUUID(), name, now],
    });
  }
}

/** Idempotently backfills a column onto a table created before that column existed. */
async function addColumnIfMissing(table: string, column: string, type: string): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const hasColumn = info.rows.some((row) => (row as unknown as { name: string }).name === column);
  if (!hasColumn) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Idempotently drops a column left over from a removed feature. */
async function dropColumnIfExists(table: string, column: string): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const hasColumn = info.rows.some((row) => (row as unknown as { name: string }).name === column);
  if (hasColumn) {
    await db.execute(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}
