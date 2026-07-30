import OpenAI from "openai";
import { config } from "../config.js";

export const llmClient = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
  // The SDK ships a nested node-fetch v2 (openai/node_modules/node-fetch@2.7.0)
  // whose gunzip stream ends early on OpenRouter's gzipped responses, raising
  // ERR_STREAM_PREMATURE_CLOSE on every single attempt — a deterministic
  // failure that no amount of retrying can clear. Node's native fetch (undici)
  // decompresses the same responses correctly, so hand the SDK that instead.
  // Cast required: the SDK types this option against node-fetch v2's Request,
  // which is structurally incompatible with the native/DOM one. The shapes the
  // SDK actually uses (url, init, response body) line up at runtime.
  fetch: globalThis.fetch as any,
  // Retained from the retry fix: these cover genuine transient failures (429s,
  // 5xx, real socket drops), which still exist independently of the gzip bug.
  maxRetries: 4,
  // 60s per request: classification responses are short, but OpenRouter routes
  // through upstream providers and can be slow to first byte.
  timeout: 60_000,
});

/** Retries a single LLM call on ERR_STREAM_PREMATURE_CLOSE. The SDK's own
 *  maxRetries covers HTTP-level failures (429s, 5xx) it can see a status for; a
 *  socket closing mid-response can surface after the SDK has committed to the
 *  response and escape that retry, so it needs handling here. Anything else
 *  rethrows immediately — this is not a general-purpose retry. */
export async function llmCallWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const code = err?.code || err?.cause?.code;
      const isPrematureClose =
        code === "ERR_STREAM_PREMATURE_CLOSE" ||
        String(err?.message ?? "")
          .toLowerCase()
          .includes("premature close");
      if (!isPrematureClose) throw err;
      // Back off before retrying, but not after the final attempt — nothing
      // follows that sleep except the throw.
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }

  throw lastErr;
}
