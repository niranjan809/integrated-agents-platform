import * as cheerio from "cheerio";
import { fetchRendered } from "./browserFetch.js";
import { normalizeWhitespace, nowIso } from "./textUtils.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "persona_targeting";

// Curated audience/persona phrases for matching visible link/heading labels.
// Multi-word and audience-framed so they don't collide with generic links —
// e.g. bare "for sales"/"for support" are excluded (they match "Contact us
// for sales/support", a routing link, not audience segmentation).
export const PERSONA_TARGETS = [
  "for developers",
  "for engineers",
  "for product teams",
  "for marketing teams",
  "for sales teams",
  "for support teams",
  "for data teams",
  "for designers",
  "for enterprises",
  "for enterprise",
  "for startups",
  "for agencies",
  "for founders",
  "for ai teams",
  "for voice ai teams",
];

// Persona slugs that, under a persona-page path prefix, reliably indicate
// audience segmentation via the URL (the common real-world pattern — a
// "Solutions"/"Use cases" menu linking to /solutions/developers etc.).
const PERSONA_SLUGS = [
  "developers",
  "engineers",
  "product-teams",
  "product-managers",
  "marketing",
  "marketers",
  "sales",
  "support",
  "data-teams",
  "designers",
  "startups",
  "enterprise",
  "enterprises",
  "agencies",
  "founders",
];
const PATH_PREFIXES = ["/for/", "/solutions/", "/use-cases/", "/use-case/", "/usecases/", "/audiences/"];

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  // Rendered fetch so nav/mega-menu persona links (added client-side) are in
  // the DOM — the plain visible-text extractor strips nav, so we read anchor
  // labels and hrefs directly here.
  const res = await fetchRendered(ctx.website);
  if (!res.ok || !res.html) return [];

  const $ = cheerio.load(res.html);
  const found = new Set<string>();

  $("a[href]").each((_, el) => {
    const anchor = $(el);
    if (anchor.find("a, button").length > 0) return;
    const text = normalizeWhitespace(anchor.text());
    const lower = text.toLowerCase();
    const href = (anchor.attr("href") ?? "").toLowerCase();

    // (1) visible "For {persona}" label
    if (text && text.length <= 40 && PERSONA_TARGETS.some((p) => lower.includes(p))) {
      found.add(text);
      return;
    }
    // (2) persona URL under a persona-page path prefix (e.g. /solutions/developers)
    for (const prefix of PATH_PREFIXES) {
      const slug = PERSONA_SLUGS.find((s) => href.includes(prefix + s));
      if (slug) {
        // Prefer the real link label; fall back to the slug if the link is
        // an icon/empty anchor.
        found.add(text && text.length <= 40 ? text : titleCaseSlug(slug));
        break;
      }
    }
  });

  // Hero/section headings like "Built for developers".
  $("h1, h2, h3").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (!text || text.length > 60) return;
    const lower = text.toLowerCase();
    if (PERSONA_TARGETS.some((p) => lower.includes(p))) found.add(text);
  });

  if (found.size === 0) return [];

  // Snippet lists the ACTUAL matched labels/personas (grounded, verifiable) —
  // never an invented claim about who they target.
  const list = Array.from(found).slice(0, 12);
  return [
    {
      sourceUrl: ctx.website,
      sourceType: SCRAPER_NAME,
      title: "Buyer persona targeting",
      snippet: `Audience/persona-targeted entries found on the homepage: ${list.map((t) => `"${t}"`).join(", ")}.`,
      scrapedAt: nowIso(),
    },
  ];
}

export const personaTargetingScraper: Scraper = { name: SCRAPER_NAME, run };
