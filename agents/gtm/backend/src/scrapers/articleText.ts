import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { fetchText, truncateSnippet } from "./httpClient.js";

/** Extracts real article/page text via Readability, which identifies the
 *  main content block and discards nav/ads/sidebars — far more robust than
 *  blacklisting <nav>/<header> tags, since many sites use plain <div>s for
 *  their menus with no semantic markup to target. Pass `html` if the page
 *  was already fetched elsewhere, to avoid a redundant request. */
export async function extractArticleSnippet(url: string, html?: string, maxLen = 400): Promise<string | null> {
  let pageHtml = html;
  if (pageHtml === undefined) {
    const res = await fetchText(url);
    if (!res.ok || !res.text) return null;
    pageHtml = res.text;
  }

  try {
    const dom = new JSDOM(pageHtml, { url });
    const article = new Readability(dom.window.document).parse();
    if (article?.textContent) return truncateSnippet(article.textContent, maxLen);
  } catch {
    // fall through to null
  }
  return null;
}

/** Domain-authority allowlist shared by scrapers that search the open web for
 *  company mentions (news, press releases) — this is what actually stops
 *  mirror/clone/homonym domains from slipping through a plain keyword match. */
export const TRUSTED_MENTION_DOMAINS = [
  "techcrunch.com",
  "venturebeat.com",
  "theverge.com",
  "forbes.com",
  "reuters.com",
  "bloomberg.com",
  "businesswire.com",
  "prnewswire.com",
  "siliconangle.com",
  "producthunt.com",
  "wired.com",
  "axios.com",
  "cnbc.com",
  "wsj.com",
  "arstechnica.com",
  "g2.com",
  "capterra.com",
  "trustradius.com",
  "reddit.com",
  "news.ycombinator.com",
  "gartner.com",
];

export function isTrustedMentionSource(url: string, companyWebsite: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const companyHost = new URL(companyWebsite).hostname.replace(/^www\./, "");
    if (host === companyHost) return true;
    return TRUSTED_MENTION_DOMAINS.some((trusted) => host === trusted || host.endsWith(`.${trusted}`));
  } catch {
    return false;
  }
}
