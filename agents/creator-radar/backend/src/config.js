// Central config. Loads .env once and exposes a validated, resolved config object.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(__dirname, "..");

function env(key, fallback = undefined) {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

export const config = {
  projectRoot,

  // RapidAPI
  rapidapi: {
    key: env("RAPIDAPI_KEY"),
    host: env("RAPIDAPI_HOST", "instagram-scraper21.p.rapidapi.com"),
    baseUrl: env("RAPIDAPI_BASE_URL", "https://instagram-scraper21.p.rapidapi.com"),
    profilePath: env("RAPIDAPI_PROFILE_PATH", "/api/v1/info"),
  },

  // OpenRouter (Gemini fallback, category only)
  openrouter: {
    key: env("OPENROUTER_API_KEY"),
    model: env("OPENROUTER_MODEL", "google/gemini-2.5-flash"),
    url: env("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions"),
  },

  // TikTok (RapidAPI: tiktok-scraper7)
  tiktok: {
    key: env("TIKTOK_RAPIDAPI_KEY"),
    host: env("TIKTOK_RAPIDAPI_HOST", "tiktok-scraper7.p.rapidapi.com"),
    base: env("TIKTOK_RAPIDAPI_BASE", "https://tiktok-scraper7.p.rapidapi.com"),
  },

  // Storage & budget
  // dbPath is the LOCAL SQLite file — retained only as the migration source / backup.
  dbPath: resolve(projectRoot, env("DB_PATH", "./db/creator_radar.db")),
  apiBudgetMonthly: Number(env("API_BUDGET_MONTHLY", "100")), // rapidapi (Instagram) + openrouter
  tiktokApiBudgetMonthly: Number(env("TIKTOK_API_BUDGET_MONTHLY", "250")), // tiktok_rapidapi

  seedPath: resolve(projectRoot, "seed_accounts.json"),
  outputDir: resolve(projectRoot, "output"),
};

// Throws if a required key for the given operation is missing. Called by scripts
// that actually need the credential, so `init`/`seed` don't require API keys.
export function requireRapidApi() {
  if (!config.rapidapi.key) {
    throw new Error("RAPIDAPI_KEY is not set. Copy .env.example to .env and fill it in.");
  }
}

export function requireOpenRouter() {
  if (!config.openrouter.key) {
    throw new Error("OPENROUTER_API_KEY is not set (needed only for LLM category fallback).");
  }
}

export function requireTikTok() {
  if (!config.tiktok.key) {
    throw new Error("TIKTOK_RAPIDAPI_KEY is not set in .env.");
  }
}
