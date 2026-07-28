import { withPage } from "./browser.js";
import { resolveUrl, nowIso } from "./textUtils.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  for (const path of ["/signup", "/register", "/sign-up"]) {
    const url = resolveUrl(ctx.website, path);

    const found = await withPage(async (page) => {
      const response = await page.goto(url, { timeout: 12_000, waitUntil: "domcontentloaded" }).catch(() => null);
      if (!response || !response.ok()) return null;

      const hasEmailField = (await page.locator('input[type="email"], input[name*="email" i]').count()) > 0;
      const hasPasswordField = (await page.locator('input[type="password"]').count()) > 0;
      if (!hasEmailField && !hasPasswordField) return null;

      const candidate: EvidenceCandidate = {
        sourceUrl: page.url(),
        sourceType: "signup_flow",
        title: "Self-serve signup",
        snippet: `A self-serve signup form (email/password fields) is directly accessible at ${path} without requiring a sales conversation.`,
        scrapedAt: nowIso(),
      };
      return candidate;
    });

    if (found) return [found];
  }

  return [];
}

export const signupFlowScraper: Scraper = { name: "signup_flow", run };
