import type { CheerioAPI } from "cheerio";

export function nowIso(): string {
  return new Date().toISOString();
}

/** Visible body text only — cheerio's .text() otherwise includes the raw
 *  contents of <script>/<style>/<noscript> tags (e.g. JSON-LD SEO markup,
 *  which shows up as garbled JSON full of URLs), plus site-wide nav/header/
 *  footer boilerplate ("Skip to content", menu links, etc.) that isn't the
 *  page's actual content and drowns out the real extracted text. */
export function extractVisibleText($: CheerioAPI): string {
  const $body = $("body").clone();
  $body.find('script, style, noscript, template, nav, header, footer, [role="navigation"], [aria-hidden="true"]').remove();
  return $body.text();
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Finds the first occurrence of any keyword in text and returns a snippet of raw text around it. */
export function snippetAroundKeyword(text: string, keywords: string[], contextChars = 160): string | null {
  const normalized = normalizeWhitespace(text);
  const lower = normalized.toLowerCase();

  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - contextChars / 2);
      const end = Math.min(normalized.length, idx + keyword.length + contextChars / 2);
      const prefix = start > 0 ? "…" : "";
      const suffix = end < normalized.length ? "…" : "";
      return `${prefix}${normalized.slice(start, end)}${suffix}`;
    }
  }
  return null;
}

export function resolveUrl(website: string, path: string): string {
  return new URL(path, website).toString();
}

// Arabic, CJK, Hiragana/Katakana, Hangul, Cyrillic, Hebrew, Thai, Devanagari.
const NON_LATIN_SCRIPT_PATTERN =
  /[؀-ۿݐ-ݿ一-鿿㐀-䶿぀-ヿ가-힯Ѐ-ӿ֐-׿฀-๿ऀ-ॿ]/gu;

/** Heuristic language guard, not a full language detector — flags text
 *  dominated by a non-Latin script (Arabic, CJK, Cyrillic, Hebrew, Thai,
 *  Devanagari, ...) so it's excluded before becoming an evidence card the
 *  user can't read. This catches cases the sitemap's locale-path filter
 *  misses entirely: a homepage whose default (unprefixed) content is simply
 *  in another language, or a news/press search result that happens to be a
 *  non-English article. European languages sharing the Latin alphabet
 *  (French, German, Spanish, ...) aren't caught by this — that needs a real
 *  language detector, a heavier dependency than this warrants right now. */
export function isLikelyNonEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 20) return false; // not enough signal in very short text
  const nonLatinMatches = text.match(NON_LATIN_SCRIPT_PATTERN) ?? [];
  return nonLatinMatches.length / letters.length > 0.15;
}
