import { randomUUID } from "node:crypto";
import { db } from "./client.js";
import type { GtmStrategy, GtmCategoryName } from "../types.js";

interface StrategyRow {
  id: string;
  company_id: string;
  category_name: string;
  evidence_count: number;
  first_seen: string | null;
  last_updated: string | null;
}

function toStrategy(row: StrategyRow): GtmStrategy {
  return {
    id: row.id,
    companyId: row.company_id,
    categoryName: row.category_name as GtmCategoryName,
    evidenceCount: row.evidence_count,
    firstSeen: row.first_seen,
    lastUpdated: row.last_updated,
  };
}

export async function upsertStrategy(
  companyId: string,
  categoryName: GtmCategoryName,
  evidenceCount: number
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO gtm_strategies (id, company_id, category_name, evidence_count, first_seen, last_updated)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(company_id, category_name)
          DO UPDATE SET evidence_count = excluded.evidence_count, last_updated = excluded.last_updated`,
    args: [randomUUID(), companyId, categoryName, evidenceCount, now, now],
  });
}

export async function listByCompany(companyId: string): Promise<GtmStrategy[]> {
  const result = await db.execute({
    sql: "SELECT * FROM gtm_strategies WHERE company_id = ? ORDER BY evidence_count DESC",
    args: [companyId],
  });
  return result.rows.map((row) => toStrategy(row as unknown as StrategyRow));
}

export async function deleteByCompany(companyId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM gtm_strategies WHERE company_id = ?", args: [companyId] });
}

export async function listAllCategoryNames(): Promise<string[]> {
  const result = await db.execute("SELECT DISTINCT category_name FROM gtm_strategies");
  return result.rows.map((row) => (row as unknown as { category_name: string }).category_name);
}
