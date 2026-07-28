import * as cheerio from "cheerio";
import { fetchRendered } from "./browserFetch.js";
import { nowIso } from "./textUtils.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "tech_stack";

interface ToolSignature {
  label: string;
  domain: string;
  // Folded into the title so the classifier has a hint which GTM category
  // this third-party tool actually implies — the evidence itself is just the
  // real script/iframe URL found on the page, never invented.
  hint: string;
  // The GTM category this tool maps to — used by defaultRules.ts to group
  // this scraper's signatures on the Categories page alongside every other
  // scraper/keyword that feeds the same category.
  category: string;
}

// Real embedded scripts/widgets are hard evidence of a GTM mechanism even
// when no matching page text exists (e.g. a Calendly widget embedded on the
// homepage is Sales-Led evidence whether or not the button says "Book a
// Demo"). Detected by literal src match, so a miss just yields no evidence —
// no risk of fabricating a tool that isn't actually there.
export const TOOL_SIGNATURES: ToolSignature[] = [
  { label: "Stripe", domain: "js.stripe.com", hint: "billing / pricing", category: "Pricing & Packaging Strategy" },
  { label: "Chargebee", domain: "chargebee.com", hint: "billing / pricing", category: "Pricing & Packaging Strategy" },
  { label: "Paddle", domain: "paddle.com", hint: "billing / pricing", category: "Pricing & Packaging Strategy" },
  {
    label: "Lemon Squeezy",
    domain: "lemonsqueezy.com",
    hint: "billing / pricing",
    category: "Pricing & Packaging Strategy",
  },
  { label: "Clerk", domain: "clerk.", hint: "self-serve auth / PLG", category: "Product-Led Growth" },
  { label: "Auth0", domain: "auth0.com", hint: "self-serve auth / PLG", category: "Product-Led Growth" },
  {
    label: "Firebase Auth",
    domain: "firebaseapp.com",
    hint: "self-serve auth / PLG",
    category: "Product-Led Growth",
  },
  { label: "Supabase Auth", domain: "supabase.co", hint: "self-serve auth / PLG", category: "Product-Led Growth" },
  { label: "Calendly", domain: "calendly.com", hint: "sales-led demo booking", category: "Sales-Led Growth" },
  { label: "Chili Piper", domain: "chilipiper.com", hint: "sales-led demo booking", category: "Sales-Led Growth" },
  { label: "HubSpot Forms", domain: "hsforms.", hint: "demand generation", category: "Demand Generation" },
  { label: "HubSpot", domain: "hs-scripts.com", hint: "demand generation", category: "Demand Generation" },
  { label: "Marketo", domain: "marketo.", hint: "demand generation", category: "Demand Generation" },
  { label: "Pardot", domain: "pardot.com", hint: "demand generation", category: "Demand Generation" },
  { label: "Mailchimp", domain: "list-manage.com", hint: "demand generation", category: "Demand Generation" },
  { label: "Brevo", domain: "sendinblue.com", hint: "demand generation", category: "Demand Generation" },
  { label: "ConvertKit", domain: "convertkit.com", hint: "demand generation", category: "Demand Generation" },
  { label: "Substack", domain: "substack.com", hint: "demand generation", category: "Demand Generation" },
  { label: "Beehiiv", domain: "beehiiv.com", hint: "demand generation", category: "Demand Generation" },
  { label: "Typeform", domain: "typeform.com", hint: "demand generation", category: "Demand Generation" },
  { label: "Tally", domain: "tally.so", hint: "demand generation", category: "Demand Generation" },
  {
    label: "Google Forms",
    domain: "docs.google.com/forms",
    hint: "demand generation",
    category: "Demand Generation",
  },
  {
    label: "Stripe Checkout",
    domain: "checkout.stripe.com",
    hint: "billing / pricing",
    category: "Pricing & Packaging Strategy",
  },
  { label: "Intercom", domain: "widget.intercom.io", hint: "live chat / sales engagement", category: "Sales-Led Growth" },
  { label: "Zendesk", domain: "zdassets.com", hint: "live chat / sales engagement", category: "Sales-Led Growth" },
  { label: "Drift", domain: "js.driftt.com", hint: "live chat / sales engagement", category: "Sales-Led Growth" },
  { label: "Crisp", domain: "client.crisp.chat", hint: "live chat / sales engagement", category: "Sales-Led Growth" },
];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const res = await fetchRendered(ctx.website);
  if (!res.ok || !res.html) return [];

  const $ = cheerio.load(res.html);
  const srcs: string[] = [];
  $("script[src], iframe[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) srcs.push(src);
  });

  const candidates: EvidenceCandidate[] = [];

  for (const tool of TOOL_SIGNATURES) {
    const match = srcs.find((src) => src.toLowerCase().includes(tool.domain.toLowerCase()));
    if (!match) continue;

    candidates.push({
      sourceUrl: ctx.website,
      sourceType: SCRAPER_NAME,
      title: `Third-party tool: ${tool.label} (${tool.hint})`,
      snippet: `Embedded ${tool.label} script/widget detected on the homepage: ${match}`,
      scrapedAt: nowIso(),
    });
  }

  return candidates;
}

export const techStackScraper: Scraper = { name: SCRAPER_NAME, run };
