import { webSearch } from "./search.js";
import { fetchText, truncateSnippet } from "./httpClient.js";
import { nowIso } from "./textUtils.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "github_releases";
const MAX_REPO_CANDIDATES = 3;
const MAX_RELEASES = 5;

interface GithubRelease {
  name: string | null;
  tag_name: string;
  html_url: string;
  published_at: string | null;
  body: string | null;
}

function extractOwnerRepoCandidates(urls: string[]): Array<{ owner: string; repo: string }> {
  const seen = new Set<string>();
  const candidates: Array<{ owner: string; repo: string }> = [];

  for (const url of urls) {
    const match = url.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (!match) continue;
    const [, owner, repo] = match;
    const key = `${owner}/${repo}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ owner, repo });
    }
  }
  return candidates.slice(0, MAX_REPO_CANDIDATES);
}

async function fetchReleases(owner: string, repo: string): Promise<GithubRelease[]> {
  const res = await fetchText(`https://api.github.com/repos/${owner}/${repo}/releases`, 8000);
  if (!res.ok || !res.text) return [];
  try {
    const parsed = JSON.parse(res.text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const results = await webSearch(`site:github.com "${ctx.companyName}"`);
  const candidates = extractOwnerRepoCandidates(results.map((r) => r.url));

  for (const { owner, repo } of candidates) {
    const releases = await fetchReleases(owner, repo);
    if (releases.length === 0) continue;

    return releases.slice(0, MAX_RELEASES).map(
      (release): EvidenceCandidate => ({
        sourceUrl: release.html_url,
        sourceType: SCRAPER_NAME,
        title: release.name || release.tag_name,
        snippet: release.body
          ? truncateSnippet(release.body, 300)
          : `Release ${release.tag_name} published${release.published_at ? ` on ${release.published_at.slice(0, 10)}` : ""}.`,
        scrapedAt: nowIso(),
      })
    );
  }

  return [];
}

export const githubReleasesScraper: Scraper = { name: SCRAPER_NAME, run };
