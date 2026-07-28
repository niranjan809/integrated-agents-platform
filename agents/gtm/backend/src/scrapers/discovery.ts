import { webSearch } from "./search.js";
import { fetchText } from "./httpClient.js";
import * as companiesRepo from "../db/companies.repo.js";
import { findKnownWebsite } from "../knownCompanies.js";
import { selectOfficialWebsite } from "../classifier/selectWebsite.js";
import type { ScraperContext } from "../types.js";

const PARKED_DOMAIN_MARKERS = [
  "domain is for sale",
  "buy this domain",
  "this domain may be for sale",
  "checkout the full domain details",
  "related searches",
  "landingUrl",
];

const EXCLUDED_HOSTS = [
  "wikipedia.org",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "crunchbase.com",
  "producthunt.com",
  "g2.com",
  "reddit.com",
  "github.com",
  // Aggregators / directories / app stores that rank highly for a company
  // name but are never the company's own official site.
  "medium.com",
  "glassdoor.com",
  "pitchbook.com",
  "tracxn.com",
  "apps.apple.com",
  "play.google.com",
  "apolloapi.io",
  "ycombinator.com",
];

function isLikelyParkedDomain(html: string): boolean {
  const lower = html.toLowerCase();
  return PARKED_DOMAIN_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : "";
}

// Suffixes/qualifiers that are too generic on their own to confirm a page is
// actually about the company (nearly every AI company's name contains one of
// these) — dropped so the real, distinguishing part of the name is what gets
// checked against the fetched page.
const GENERIC_NAME_WORDS = ["ai", "inc", "labs", "technologies", "technology", "tech", "co", "corp", "hq", "app"];

function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !GENERIC_NAME_WORDS.includes(t));
}

/** A domain returning HTTP 200 doesn't mean it's the right company — a
 *  slugified guess can just as easily hit an unrelated live site that
 *  happens to own that exact name+TLD. Require the company's own
 *  distinguishing name token(s) to actually appear on the page before
 *  trusting it as "the official site". */
function pageMentionsCompany(html: string, companyName: string): boolean {
  const tokens = significantTokens(companyName);
  if (tokens.length === 0) return true; // nothing distinctive to check — don't block on it
  const haystack = `${extractTitle(html)} ${html.slice(0, 3000)}`.toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

/** Ordered, de-duped candidate hosts for a company name (best guess first). */
async function candidateHosts(companyName: string): Promise<{ hosts: string[]; topRanked: string | null }> {
  const results = await webSearch(`${companyName} official website`);
  const orderedHosts = [
    ...new Set(
      results
        .map((r) => {
          try {
            return new URL(r.url).hostname.replace(/^www\./, "");
          } catch {
            return null;
          }
        })
        .filter((host): host is string => host !== null && !EXCLUDED_HOSTS.some((excluded) => host.endsWith(excluded)))
    ),
  ];

  const tokens = significantTokens(companyName);
  const domainMatches = (host: string) => tokens.length > 0 && tokens.some((t) => host.replace(/\./g, "").includes(t));
  const ordered = [...orderedHosts.filter(domainMatches), ...orderedHosts.filter((h) => !domainMatches(h))];

  // Slug guesses as low-priority extras, in case search missed a very new co.
  const slug = slugify(companyName);
  const hosts = [...new Set([...ordered, `${slug}.com`, `${slug}.ai`])];
  return { hosts, topRanked: orderedHosts[0] ?? null };
}

/** A short slice of the page's visible text, to ground the LLM selector. */
function pageSnippet(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function resolveWebsite(companyName: string): Promise<string | null> {
  const known = findKnownWebsite(companyName);
  if (known) return known;

  const { hosts, topRanked } = await candidateHosts(companyName);
  const tokens = significantTokens(companyName);
  const domainMatches = (host: string) => tokens.length > 0 && tokens.some((t) => host.replace(/\./g, "").includes(t));

  // Fetch each candidate once — the same fetch feeds both the grounded LLM
  // selector (page title + real text) and the heuristic fallback (reachable /
  // parked / names-the-company).
  const fetched = await Promise.all(
    hosts.slice(0, 6).map(async (host) => {
      const origin = `https://${host}`;
      const res = await fetchText(origin, 6000);
      const ok = res.ok && !!res.text;
      return {
        host,
        origin,
        ok,
        parked: ok ? isLikelyParkedDomain(res.text) : false,
        mentions: ok ? pageMentionsCompany(res.text, companyName) : false,
        title: ok ? extractTitle(res.text).replace(/\s+/g, " ").trim().slice(0, 120) : "",
        snippet: ok ? pageSnippet(res.text) : "",
      };
    })
  );

  // Grounded LLM pick — limited to candidates that actually responded and
  // aren't parked, so the model only ever reasons over real, live pages and
  // can only return one of their exact URLs.
  const llmCandidates = fetched
    .filter((f) => f.ok && !f.parked)
    .map((f) => ({ url: f.origin, title: f.title, snippet: f.snippet }));
  const llmPick = await selectOfficialWebsite(companyName, llmCandidates);
  if (llmPick) return llmPick;

  // Heuristic fallback (model abstained or unavailable): first reachable +
  // not-parked + names-the-company, preferring domain matches; then trust an
  // unreachable domain match or the unreachable top-ranked search result.
  const ordered = [...fetched.filter((f) => domainMatches(f.host)), ...fetched.filter((f) => !domainMatches(f.host))];
  for (const f of ordered) {
    if (f.ok && !f.parked && f.mentions) return f.origin;
    if (!f.ok && domainMatches(f.host)) return f.origin;
  }
  if (topRanked) {
    const top = fetched.find((f) => f.host === topRanked);
    if (top && !top.ok) return `https://${topRanked}`;
  }

  // Last resort: raw {slug}.com/.ai guesses (search may have missed a very new
  // company), still requiring visible confirmation.
  const slug = slugify(companyName);
  for (const domain of [`https://${slug}.com`, `https://${slug}.ai`]) {
    const res = await fetchText(domain, 6000);
    if (res.ok && !isLikelyParkedDomain(res.text) && pageMentionsCompany(res.text, companyName)) return domain;
  }

  return null;
}

async function resolvePhSlug(companyName: string): Promise<string | null> {
  const results = await webSearch(`site:producthunt.com ${companyName}`);
  const hit = results.find((r) => r.url.includes("producthunt.com/products/") || r.url.includes("producthunt.com/posts/"));
  if (!hit) return null;
  const match = hit.url.match(/producthunt\.com\/(?:products|posts)\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

export async function discoverCompany(
  companyId: string,
  companyName: string,
  existingWebsite?: string | null
): Promise<ScraperContext> {
  // Respect a website that's already known (a prior successful discovery, or
  // a manual edit via the Companies page) instead of blindly re-guessing and
  // potentially clobbering a correct manual entry with a bad auto-discovery.
  const [website, phSlug] = await Promise.all([
    existingWebsite ? Promise.resolve(existingWebsite) : resolveWebsite(companyName),
    resolvePhSlug(companyName),
  ]);

  await companiesRepo.updateCompanyDiscovery(companyId, { website, phSlug });

  if (!website) {
    throw new Error(`Could not discover an official website for "${companyName}"`);
  }

  return { companyId, companyName, website, phSlug };
}
