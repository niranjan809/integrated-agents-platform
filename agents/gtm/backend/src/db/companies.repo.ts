import { db } from "./client.js";
import type { Company, CompanyScope, CompanyStatus } from "../types.js";

interface CompanyRow {
  id: string;
  name: string;
  website: string | null;
  segment: string | null;
  ph_slug: string | null;
  scope: string | null;
  hq_country: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    segment: row.segment,
    phSlug: row.ph_slug,
    scope: row.scope as CompanyScope | null,
    hqCountry: row.hq_country,
    status: row.status as CompanyStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertCompany(input: {
  id: string;
  name: string;
  segment?: string | null;
  website?: string | null;
}): Promise<Company> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO companies (id, name, website, segment, ph_slug, scope, hq_country, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, NULL, NULL, 'pending', ?, ?)`,
    args: [input.id, input.name, input.website ?? null, input.segment ?? null, now, now],
  });
  return {
    id: input.id,
    name: input.name,
    website: input.website ?? null,
    segment: input.segment ?? null,
    phSlug: null,
    scope: null,
    hqCountry: null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export async function listCompanies(): Promise<Company[]> {
  const result = await db.execute("SELECT * FROM companies ORDER BY created_at DESC");
  return result.rows.map((row) => toCompany(row as unknown as CompanyRow));
}

export async function getCompany(id: string): Promise<Company | null> {
  const result = await db.execute({ sql: "SELECT * FROM companies WHERE id = ?", args: [id] });
  if (result.rows.length === 0) return null;
  return toCompany(result.rows[0] as unknown as CompanyRow);
}

export async function updateCompanyStatus(id: string, status: CompanyStatus): Promise<void> {
  await db.execute({
    sql: "UPDATE companies SET status = ?, updated_at = ? WHERE id = ?",
    args: [status, new Date().toISOString(), id],
  });
}

/** Only writes a non-null scope — a transient homepage-fetch failure on
 *  re-analysis shouldn't blank out a previously-successful classification. */
export async function updateCompanyScope(id: string, scope: CompanyScope | null): Promise<void> {
  if (!scope) return;
  await db.execute({
    sql: "UPDATE companies SET scope = ?, updated_at = ? WHERE id = ?",
    args: [scope, new Date().toISOString(), id],
  });
}

/** Only fills segment if it's currently unset — never overwrites a manually
 *  entered or previously-classified value with a fresh auto-classification. */
export async function updateCompanySegmentIfMissing(id: string, segment: string | null): Promise<void> {
  if (!segment) return;
  await db.execute({
    sql: "UPDATE companies SET segment = COALESCE(segment, ?), updated_at = ? WHERE id = ?",
    args: [segment, new Date().toISOString(), id],
  });
}

/** Same COALESCE pattern as segment — only fills HQ country if unset, never
 *  overwrites a manual edit or a prior classification. */
export async function updateCompanyCountryIfMissing(id: string, hqCountry: string | null): Promise<void> {
  if (!hqCountry) return;
  await db.execute({
    sql: "UPDATE companies SET hq_country = COALESCE(hq_country, ?), updated_at = ? WHERE id = ?",
    args: [hqCountry, new Date().toISOString(), id],
  });
}

export async function updateCompanyDetails(
  id: string,
  fields: { name?: string; segment?: string | null; website?: string | null; hqCountry?: string | null }
): Promise<void> {
  const sets: string[] = [];
  const args: (string | null)[] = [];

  if (fields.name !== undefined) {
    sets.push("name = ?");
    args.push(fields.name);
  }
  if (fields.segment !== undefined) {
    sets.push("segment = ?");
    args.push(fields.segment);
  }
  if (fields.website !== undefined) {
    sets.push("website = ?");
    args.push(fields.website);
  }
  if (fields.hqCountry !== undefined) {
    sets.push("hq_country = ?");
    args.push(fields.hqCountry);
  }
  if (sets.length === 0) return;

  sets.push("updated_at = ?");
  args.push(new Date().toISOString());
  args.push(id);

  await db.execute({ sql: `UPDATE companies SET ${sets.join(", ")} WHERE id = ?`, args });
}

export async function deleteCompany(id: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM companies WHERE id = ?", args: [id] });
}

export async function updateCompanyDiscovery(
  id: string,
  fields: { website?: string | null; phSlug?: string | null }
): Promise<void> {
  await db.execute({
    sql: "UPDATE companies SET website = COALESCE(?, website), ph_slug = COALESCE(?, ph_slug), updated_at = ? WHERE id = ?",
    args: [fields.website ?? null, fields.phSlug ?? null, new Date().toISOString(), id],
  });
}
