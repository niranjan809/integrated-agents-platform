import { randomUUID } from "node:crypto";
import { db } from "./client.js";
import type { Evidence, EvidenceCandidate, ClassificationResult, GtmCategoryName } from "../types.js";

interface EvidenceRow {
  id: string;
  company_id: string;
  source_url: string;
  source_type: string;
  title: string | null;
  snippet: string;
  scraped_at: string;
  gtm_category: string | null;
  confidence: number | null;
  classification_reasoning: string | null;
}

function toEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    companyId: row.company_id,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    title: row.title,
    snippet: row.snippet,
    scrapedAt: row.scraped_at,
    gtmCategory: row.gtm_category as GtmCategoryName | null,
    confidence: row.confidence,
    classificationReasoning: row.classification_reasoning,
  };
}

export interface ClassifiedEvidence {
  candidate: EvidenceCandidate;
  classification: ClassificationResult;
}

export async function insertMany(companyId: string, items: ClassifiedEvidence[]): Promise<void> {
  for (const item of items) {
    await db.execute({
      sql: `INSERT INTO evidence
              (id, company_id, source_url, source_type, title, snippet, scraped_at, gtm_category, confidence, classification_reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        companyId,
        item.candidate.sourceUrl,
        item.candidate.sourceType,
        item.candidate.title,
        item.candidate.snippet,
        item.candidate.scrapedAt,
        item.classification.gtmCategory,
        item.classification.confidence,
        item.classification.reasoning,
      ],
    });
  }
}

export async function listByCompany(
  companyId: string,
  opts: { limit: number; offset: number }
): Promise<Evidence[]> {
  const result = await db.execute({
    sql: "SELECT * FROM evidence WHERE company_id = ? ORDER BY scraped_at DESC LIMIT ? OFFSET ?",
    args: [companyId, opts.limit, opts.offset],
  });
  return result.rows.map((row) => toEvidence(row as unknown as EvidenceRow));
}

export async function listByCategory(companyId: string, category: string): Promise<Evidence[]> {
  const result = await db.execute({
    sql: `SELECT * FROM evidence WHERE company_id = ? AND gtm_category = ?
          ORDER BY confidence DESC`,
    args: [companyId, category],
  });
  return result.rows.map((row) => toEvidence(row as unknown as EvidenceRow));
}

export interface EvidenceSearchResult extends Evidence {
  companyName: string;
}

interface EvidenceSearchRow extends EvidenceRow {
  company_name: string;
}

/** Cross-company search over already-classified evidence (gtm_category IS
 *  NOT NULL) — this is what lets a search answer "which companies mention
 *  usage-based pricing" instead of every insight being trapped inside one
 *  company's own drill-down. Excludes unclassified/no-signal rows by default
 *  so results aren't polluted with evidence the LLM already decided was
 *  irrelevant. */
export async function searchAcrossCompanies(opts: {
  q?: string;
  category?: string;
  sourceType?: string;
  limit: number;
}): Promise<EvidenceSearchResult[]> {
  const conditions: string[] = ["e.gtm_category IS NOT NULL"];
  const args: (string | number)[] = [];

  if (opts.q) {
    conditions.push("(e.snippet LIKE ? OR e.title LIKE ? OR e.source_url LIKE ?)");
    const like = `%${opts.q}%`;
    args.push(like, like, like);
  }
  if (opts.category) {
    conditions.push("e.gtm_category = ?");
    args.push(opts.category);
  }
  if (opts.sourceType) {
    conditions.push("e.source_type = ?");
    args.push(opts.sourceType);
  }

  args.push(opts.limit);

  const result = await db.execute({
    sql: `SELECT e.*, c.name as company_name FROM evidence e
          JOIN companies c ON c.id = e.company_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY e.confidence DESC
          LIMIT ?`,
    args,
  });

  return result.rows.map((row) => {
    const r = row as unknown as EvidenceSearchRow;
    return { ...toEvidence(r), companyName: r.company_name };
  });
}

export async function deleteByCompany(companyId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM evidence WHERE company_id = ?", args: [companyId] });
}

export async function existsForCompany(companyId: string): Promise<boolean> {
  const result = await db.execute({
    sql: "SELECT 1 FROM evidence WHERE company_id = ? LIMIT 1",
    args: [companyId],
  });
  return result.rows.length > 0;
}
