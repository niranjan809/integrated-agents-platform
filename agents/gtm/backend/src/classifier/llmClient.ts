import OpenAI from "openai";
import { config } from "../config.js";

export const llmClient = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
  // Without these, a single transient hiccup fails the call permanently and the
  // caller's catch turns it into a null classification — which reads as "no
  // signal found" rather than "the request never completed".
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
