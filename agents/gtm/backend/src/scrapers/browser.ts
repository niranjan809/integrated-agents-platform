import { chromium, type Browser, type Page } from "playwright";
import pLimit from "p-limit";

let browserPromise: Promise<Browser> | null = null;

// Process-wide cap on concurrent Playwright pages. Without this, analyzing
// several companies at once (each fanning out several Playwright-based
// scrapers) can overload the single shared browser instance, causing page
// loads to silently time out and evidence to go missing with no error.
const pageLimit = pLimit(4);

/** One shared Chromium instance reused across all scrapers in a run, instead
 *  of each scraper launching (and paying the cost of) its own browser. */
export function getBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = chromium.launch();
  return browserPromise;
}

/** Runs `fn` with a fresh page, queued behind the process-wide page limit,
 *  and always closes the page afterward. */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  return pageLimit(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close();
    }
  });
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}
