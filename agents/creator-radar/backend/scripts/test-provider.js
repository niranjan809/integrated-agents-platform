// One-off provider verification. Confirms the RapidAPI profile endpoint in .env
// actually returns real data via Node, and dumps a raw sample for adapter mapping.
//
// NOTE: This deliberately does NOT go through src/budget.js. It is a manual
// verification probe, not a pipeline fetch, so it must not touch the api_calls
// counter. Real fetches (scripts/fetch.js) will be budget-gated.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config, requireRapidApi } from "../src/config.js";

const HANDLE = "aiwithunnati";

function fail(msg, extra) {
  console.error(`\n❌ ${msg}`);
  if (extra !== undefined) console.error(extra);
  process.exit(1);
}

requireRapidApi();

// Build URL exactly from .env config: BASE_URL + PROFILE_PATH + ?username=<handle>
const url = `${config.rapidapi.baseUrl}${config.rapidapi.profilePath}?username=${encodeURIComponent(HANDLE)}`;

console.log(`GET ${url}`);
console.log(`host header: ${config.rapidapi.host}`);

let res, text;
try {
  res = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-host": config.rapidapi.host,
      "x-rapidapi-key": config.rapidapi.key,
    },
  });
  text = await res.text();
} catch (e) {
  fail(`Request threw: ${e.message}`);
}

console.log(`\nHTTP status: ${res.status} ${res.statusText}`);

let json;
try {
  json = JSON.parse(text);
} catch {
  fail(`Response is not valid JSON (first 500 chars):`, text.slice(0, 500));
}

// Persist raw response for adapter reference.
const outPath = resolve(config.projectRoot, "scratch/sample_response_profile.json");
mkdirSync(resolve(config.projectRoot, "scratch"), { recursive: true });
writeFileSync(outPath, JSON.stringify(json, null, 2));
console.log(`\nSaved raw JSON -> ${outPath}`);

if (res.status !== 200) fail(`Non-200 status: ${res.status}`, JSON.stringify(json).slice(0, 500));
if (json === null || (typeof json === "object" && Object.keys(json).length === 0)) {
  fail("Response body is null/empty.");
}

// Top-level keys (and one level into a `data`/`user` wrapper if present).
console.log(`\nTop-level keys: ${Object.keys(json).join(", ")}`);
const wrappers = ["data", "user", "graphql", "result"];
for (const w of wrappers) {
  if (json[w] && typeof json[w] === "object" && !Array.isArray(json[w])) {
    console.log(`  ${w}.* keys: ${Object.keys(json[w]).join(", ")}`);
  }
}

// Pull candidate profile fields from the most common shapes so we can see the
// provider's ACTUAL field names for the adapter. Search top-level and wrappers.
function firstDefined(paths) {
  for (const p of paths) {
    const val = p.split(".").reduce((o, k) => (o == null ? o : o[k]), json);
    if (val !== undefined && val !== null) return { path: p, value: val };
  }
  return null;
}

const fields = {
  full_name: ["full_name", "user.full_name", "data.full_name", "graphql.user.full_name"],
  biography: ["biography", "bio", "user.biography", "data.biography", "graphql.user.biography"],
  follower_count: [
    "follower_count",
    "followers_count",
    "edge_followed_by.count",
    "user.follower_count",
    "user.edge_followed_by.count",
    "graphql.user.edge_followed_by.count",
  ],
  following_count: [
    "following_count",
    "followings_count",
    "edge_follow.count",
    "user.following_count",
    "graphql.user.edge_follow.count",
  ],
  post_count: [
    "media_count",
    "post_count",
    "edge_owner_to_timeline_media.count",
    "user.media_count",
    "graphql.user.edge_owner_to_timeline_media.count",
  ],
  is_verified: ["is_verified", "user.is_verified", "graphql.user.is_verified"],
  external_url: ["external_url", "user.external_url", "graphql.user.external_url"],
};

console.log(`\n--- Candidate profile fields (actual path -> value) ---`);
const missing = [];
for (const [label, paths] of Object.entries(fields)) {
  const hit = firstDefined(paths);
  if (hit) {
    const shown = typeof hit.value === "string" ? JSON.stringify(hit.value.slice(0, 80)) : hit.value;
    console.log(`  ${label.padEnd(16)} @ ${hit.path.padEnd(38)} = ${shown}`);
  } else {
    console.log(`  ${label.padEnd(16)} NOT FOUND under common paths`);
    missing.push(label);
  }
}

if (missing.length) {
  console.warn(
    `\n⚠️  ${missing.length} expected field(s) not found under common paths: ${missing.join(", ")}`
  );
  console.warn(`   Inspect ${outPath} to find their real names before writing the adapter.`);
  process.exit(2);
}

console.log(`\n✅ Profile endpoint returned real data with all core fields present.`);
