import { randomUUID } from "node:crypto";
import { db } from "./client.js";
import type { DetectionRule, RuleType, GtmCategoryName } from "../types.js";

interface RuleRow {
  id: string;
  scraper_name: string;
  rule_type: string;
  value: string;
  category: string | null;
  company_id: string | null;
  created_at: string;
}

function toRule(row: RuleRow): DetectionRule {
  return {
    id: row.id,
    scraperName: row.scraper_name,
    ruleType: row.rule_type as RuleType,
    value: row.value,
    category: row.category as GtmCategoryName | null,
    companyId: row.company_id,
    createdAt: row.created_at,
  };
}

export async function listAll(): Promise<DetectionRule[]> {
  const result = await db.execute("SELECT * FROM detection_rules ORDER BY created_at DESC");
  return result.rows.map((row) => toRule(row as unknown as RuleRow));
}

export async function listByCompany(companyId: string): Promise<DetectionRule[]> {
  const result = await db.execute({
    sql: "SELECT * FROM detection_rules WHERE company_id = ? ORDER BY created_at DESC",
    args: [companyId],
  });
  return result.rows.map((row) => toRule(row as unknown as RuleRow));
}

/** Global rules (company_id IS NULL) plus any rules scoped to this specific company, if given. */
export async function listByScraperAndType(
  scraperName: string,
  ruleType: RuleType,
  companyId?: string
): Promise<string[]> {
  const result = await db.execute({
    sql: `SELECT value FROM detection_rules
          WHERE scraper_name = ? AND rule_type = ? AND (company_id IS NULL OR company_id = ?)`,
    args: [scraperName, ruleType, companyId ?? null],
  });
  return result.rows.map((row) => (row as unknown as { value: string }).value);
}

export async function insert(input: {
  scraperName: string;
  ruleType: RuleType;
  value: string;
  category?: GtmCategoryName | null;
  companyId?: string | null;
}): Promise<DetectionRule> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO detection_rules (id, scraper_name, rule_type, value, category, company_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.scraperName, input.ruleType, input.value, input.category ?? null, input.companyId ?? null, createdAt],
  });
  return {
    id,
    scraperName: input.scraperName,
    ruleType: input.ruleType,
    value: input.value,
    category: input.category ?? null,
    companyId: input.companyId ?? null,
    createdAt,
  };
}

export async function remove(id: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM detection_rules WHERE id = ?", args: [id] });
}

export async function deleteByCompany(companyId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM detection_rules WHERE company_id = ?", args: [companyId] });
}
