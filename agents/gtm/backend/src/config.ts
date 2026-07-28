import { z } from "zod";

const ConfigSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  TURSO_DATABASE_URL: z.string().optional().default(""),
  TURSO_AUTH_TOKEN: z.string().optional().default(""),
  SQLITE_PATH: z.string().default("gtm.db"),
  LLM_MODEL: z.string().default("google/gemini-2.5-flash"),
  CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65),
  PORT: z.coerce.number().default(8000),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

// Fail-fast in production: a missing TURSO_DATABASE_URL would otherwise
// silently fall back to a local SQLite file (see `dbUrl` below). On hosts with
// ephemeral disks that file disappears on restart/redeploy — silent data loss.
// Require the remote DB explicitly in production; the local-SQLite fallback is
// a dev-only convenience.
if (process.env.NODE_ENV === "production" && !parsed.data.TURSO_DATABASE_URL) {
  throw new Error(
    "TURSO_DATABASE_URL is required in production — refusing to fall back to a local SQLite file. " +
      "Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN), or don't run with NODE_ENV=production for local SQLite dev."
  );
}

// A remote Turso URL needs an auth token — catch the half-configured case
// early with a clear message instead of an opaque connection failure later.
const isRemoteDb =
  parsed.data.TURSO_DATABASE_URL.startsWith("libsql://") ||
  parsed.data.TURSO_DATABASE_URL.startsWith("https://") ||
  parsed.data.TURSO_DATABASE_URL.startsWith("wss://");
if (isRemoteDb && !parsed.data.TURSO_AUTH_TOKEN) {
  throw new Error("TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL points at a remote (libsql://) database.");
}

export const config = {
  openRouterApiKey: parsed.data.OPENROUTER_API_KEY,
  dbUrl: parsed.data.TURSO_DATABASE_URL || `file:${parsed.data.SQLITE_PATH}`,
  dbAuthToken: parsed.data.TURSO_AUTH_TOKEN || undefined,
  llmModel: parsed.data.LLM_MODEL,
  confidenceThreshold: parsed.data.CLASSIFICATION_CONFIDENCE_THRESHOLD,
  port: parsed.data.PORT,
};
