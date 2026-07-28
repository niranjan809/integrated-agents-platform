import { db } from "./client.js";
import type { ScrapeJob, JobStatus, JobStep } from "../types.js";

interface JobRow {
  id: string;
  company_id: string;
  status: string;
  current_step: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_msg: string | null;
}

function toJob(row: JobRow): ScrapeJob {
  return {
    id: row.id,
    companyId: row.company_id,
    status: row.status as JobStatus,
    currentStep: row.current_step as JobStep | null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMsg: row.error_msg,
  };
}

export async function create(job: { id: string; companyId: string; status: JobStatus; currentStep: JobStep }): Promise<void> {
  await db.execute({
    sql: `INSERT INTO scrape_jobs (id, company_id, status, current_step, started_at, completed_at, error_msg)
          VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    args: [job.id, job.companyId, job.status, job.currentStep, new Date().toISOString()],
  });
}

export async function updateStep(jobId: string, step: JobStep): Promise<void> {
  await db.execute({
    sql: "UPDATE scrape_jobs SET current_step = ? WHERE id = ?",
    args: [step, jobId],
  });
}

export async function complete(jobId: string, step: JobStep): Promise<void> {
  await db.execute({
    sql: "UPDATE scrape_jobs SET status = 'done', current_step = ?, completed_at = ? WHERE id = ?",
    args: [step, new Date().toISOString(), jobId],
  });
}

export async function fail(jobId: string, errorMsg: string): Promise<void> {
  await db.execute({
    sql: "UPDATE scrape_jobs SET status = 'failed', error_msg = ?, completed_at = ? WHERE id = ?",
    args: [errorMsg, new Date().toISOString(), jobId],
  });
}

export async function getLatestForCompany(companyId: string): Promise<ScrapeJob | null> {
  const result = await db.execute({
    sql: "SELECT * FROM scrape_jobs WHERE company_id = ? ORDER BY started_at DESC LIMIT 1",
    args: [companyId],
  });
  if (result.rows.length === 0) return null;
  return toJob(result.rows[0] as unknown as JobRow);
}

export async function deleteByCompany(companyId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM scrape_jobs WHERE company_id = ?", args: [companyId] });
}

export async function markStaleRunningAsFailed(olderThanMinutes: number): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  await db.execute({
    sql: `UPDATE scrape_jobs SET status = 'failed', error_msg = 'Interrupted by server restart', completed_at = ?
          WHERE status = 'running' AND started_at < ?`,
    args: [new Date().toISOString(), cutoff],
  });
}
