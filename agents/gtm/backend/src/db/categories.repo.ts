import { randomUUID } from "node:crypto";
import { db } from "./client.js";
import type { GtmCategory } from "../types.js";

interface CategoryRow {
  id: string;
  name: string;
  created_at: string;
}

function toCategory(row: CategoryRow): GtmCategory {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function listAll(): Promise<GtmCategory[]> {
  const result = await db.execute("SELECT * FROM gtm_categories ORDER BY created_at ASC");
  return result.rows.map((row) => toCategory(row as unknown as CategoryRow));
}

export async function listNames(): Promise<string[]> {
  return (await listAll()).map((c) => c.name);
}

export async function getById(id: string): Promise<GtmCategory | null> {
  const result = await db.execute({ sql: "SELECT * FROM gtm_categories WHERE id = ?", args: [id] });
  if (result.rows.length === 0) return null;
  return toCategory(result.rows[0] as unknown as CategoryRow);
}

export async function insert(name: string): Promise<GtmCategory> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await db.execute({
    sql: "INSERT INTO gtm_categories (id, name, created_at) VALUES (?, ?, ?)",
    args: [id, name, createdAt],
  });
  return { id, name, createdAt };
}

/** Renaming cascades to every row that references the category by name, so
 *  nothing is left pointing at a name that no longer exists. */
export async function rename(id: string, newName: string, oldName: string): Promise<void> {
  await db.execute({ sql: "UPDATE gtm_categories SET name = ? WHERE id = ?", args: [newName, id] });
  await db.execute({
    sql: "UPDATE evidence SET gtm_category = ? WHERE gtm_category = ?",
    args: [newName, oldName],
  });
  await db.execute({
    sql: "UPDATE gtm_strategies SET category_name = ? WHERE category_name = ?",
    args: [newName, oldName],
  });
  await db.execute({
    sql: "UPDATE detection_rules SET category = ? WHERE category = ?",
    args: [newName, oldName],
  });
}

/** Deleting a category un-categorizes its evidence (kept, just no longer
 *  tagged — same as any other below-threshold evidence) and removes the
 *  rolled-up gtm_strategies row so it stops appearing as a detected category. */
export async function remove(id: string, name: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM gtm_categories WHERE id = ?", args: [id] });
  await db.execute({ sql: "UPDATE evidence SET gtm_category = NULL WHERE gtm_category = ?", args: [name] });
  await db.execute({ sql: "DELETE FROM gtm_strategies WHERE category_name = ?", args: [name] });
  await db.execute({ sql: "UPDATE detection_rules SET category = NULL WHERE category = ?", args: [name] });
}
