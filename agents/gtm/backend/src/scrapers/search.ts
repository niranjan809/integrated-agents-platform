import * as cheerio from "cheerio";
import { fetchText } from "./httpClient.js";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeDdgRedirect(href: string): string {
  // DDG html endpoint wraps results as //duckduckgo.com/l/?uddg=<encoded>&rut=...
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href;
  } catch {
    return href;
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const res = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!res.ok || !res.text) return [];

  const $ = cheerio.load(res.text);
  const results: SearchResult[] = [];

  $(".result").each((_, el) => {
    const anchor = $(el).find(".result__a").first();
    const href = anchor.attr("href");
    const title = anchor.text().trim();
    const snippet = $(el).find(".result__snippet").first().text().trim();
    if (href && title) {
      results.push({ title, url: decodeDdgRedirect(href), snippet });
    }
  });

  return results;
}

function decodeBingRedirect(href: string): string {
  // Bing wraps results as bing.com/ck/a?...&u=a1<base64url(actual url)>&... —
  // the "a1" prefix marks the encoding scheme, the rest is base64url.
  try {
    const url = new URL(href, "https://www.bing.com");
    const u = url.searchParams.get("u");
    if (u && u.startsWith("a1")) {
      const base64 = u.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
      return Buffer.from(padded, "base64").toString("utf-8");
    }
    return href;
  } catch {
    return href;
  }
}

async function searchBing(query: string): Promise<SearchResult[]> {
  const res = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
  if (!res.ok || !res.text) return [];

  const $ = cheerio.load(res.text);
  const results: SearchResult[] = [];

  $("li.b_algo").each((_, el) => {
    const anchor = $(el).find("h2 a").first();
    const href = anchor.attr("href");
    const title = anchor.text().trim();
    const snippet = $(el).find(".b_caption p").first().text().trim();
    if (href && title) {
      results.push({ title, url: decodeBingRedirect(href), snippet });
    }
  });

  return results;
}

/** Web search with DDG primary, Bing as a keyless fallback if DDG returns nothing (anti-bot / markup changes). */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const ddgResults = await searchDuckDuckGo(query);
  if (ddgResults.length > 0) return ddgResults;
  return searchBing(query);
}
