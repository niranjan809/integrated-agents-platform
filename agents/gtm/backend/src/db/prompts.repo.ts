import { randomUUID } from "node:crypto";
import { db } from "./client.js";
import type { Prompt } from "../types.js";

interface PromptRow {
  id: string;
  key: string;
  name: string;
  template: string;
  updated_at: string;
}

function toPrompt(row: PromptRow): Prompt {
  return { id: row.id, key: row.key, name: row.name, template: row.template, updatedAt: row.updated_at };
}

export async function listAll(): Promise<Prompt[]> {
  const result = await db.execute("SELECT * FROM prompts ORDER BY name ASC");
  return result.rows.map((row) => toPrompt(row as unknown as PromptRow));
}

export async function getByKey(key: string): Promise<Prompt | null> {
  const result = await db.execute({ sql: "SELECT * FROM prompts WHERE key = ?", args: [key] });
  if (result.rows.length === 0) return null;
  return toPrompt(result.rows[0] as unknown as PromptRow);
}

export async function insertIfMissing(key: string, name: string, template: string): Promise<void> {
  const existing = await getByKey(key);
  if (existing) return;
  await db.execute({
    sql: "INSERT INTO prompts (id, key, name, template, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [randomUUID(), key, name, template, new Date().toISOString()],
  });
}

export async function updateTemplate(key: string, template: string): Promise<Prompt | null> {
  await db.execute({
    sql: "UPDATE prompts SET template = ?, updated_at = ? WHERE key = ?",
    args: [template, new Date().toISOString(), key],
  });
  return getByKey(key);
}
