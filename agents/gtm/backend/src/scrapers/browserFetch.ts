import { withPage } from "./browser.js";

export interface RenderedPage {
  ok: boolean;
  url: string;
  html: string;
  text: string;
}

async function fetchRenderedOnce(url: string, timeoutMs: number): Promise<RenderedPage> {
  return withPage(async (page) => {
    const response = await page
      .goto(url, { timeout: timeoutMs, waitUntil: "domcontentloaded" })
      .catch(() => null);
    if (!response || !response.ok()) return { ok: false, url, html: "", text: "" };

    // Some sites keep client-side-navigating briefly after "domcontentloaded"
    // fires (redirects, SPA route changes) — reading content() during that
    // window throws "page is navigating" rather than returning empty. Catch
    // it here (not just at the caller) so one bad page doesn't require every
    // call site to remember its own .catch(), and retry once with a short
    // wait for the navigation to settle before giving up on this attempt.
    const html = await page.content().catch(async () => {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return page.content().catch(() => "");
    });
    if (!html) return { ok: false, url, html: "", text: "" };

    const text = await page.innerText("body").catch(() => "");
    return { ok: true, url: page.url(), html, text };
  });
}

/** Loads a page in the shared headless browser and returns both its rendered
 *  HTML (for cheerio parsing) and visible text — catches JS-rendered SPA
 *  content that a plain fetch() would see as an empty shell. Queued behind
 *  the process-wide Playwright page limit (see browser.ts), so under heavy
 *  concurrent scraping a page load can occasionally time out waiting for its
 *  turn rather than because the site itself is slow — one retry absorbs that
 *  without doubling cost on the (more common) genuine-failure case. */
export async function fetchRendered(url: string, timeoutMs = 15_000, retries = 1): Promise<RenderedPage> {
  let result = await fetchRenderedOnce(url, timeoutMs);
  for (let attempt = 0; attempt < retries && !result.ok; attempt++) {
    result = await fetchRenderedOnce(url, timeoutMs);
  }
  return result;
}
