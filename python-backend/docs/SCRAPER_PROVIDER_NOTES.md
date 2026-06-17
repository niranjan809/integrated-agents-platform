# Scraper Provider Notes

Switch providers by setting `SCRAPER_PROVIDER` in `.env`. No code changes needed.

```
SCRAPER_PROVIDER=x_official      # default
SCRAPER_PROVIDER=twitter_api45   # RapidAPI fallback
```

---

## x_official (X API v2)

**Auth:** `Authorization: Bearer <X_BEARER_TOKEN>`  
**Base URL:** `https://api.x.com/2`

| Method | Endpoint |
|--------|----------|
| `search_recent` | `GET /tweets/search/recent` |
| `user_timeline` | `GET /users/by/username/{handle}` → `GET /users/{id}/tweets` |
| `conversation_replies` | `GET /tweets/search/recent?query=conversation_id:{id} is:reply` |

**Native operators (all supported):**

| Operator | Example |
|----------|---------|
| OR grouping | `(kw1 OR kw2)` |
| `min_faves:` | `min_faves:10` |
| `-is:retweet` | excludes retweets |
| `-is:reply` | excludes replies |
| `lang:` | `lang:en` |
| `from:` | `from:elonmusk` |
| `conversation_id:` | `conversation_id:12345` |
| `since_id` | API parameter, not query operator |

**Rate limits:** `x-rate-limit-remaining` / `x-rate-limit-reset` (Unix timestamp)

**Pagination:** `next_token` in `meta` block for searches; cursor-based for timelines.

**Response shape:** Standard X API v2 — tweets under `data[]`, author expansion under `includes.users[]`.

---

## twitter_api45 (RapidAPI)

**Auth:** `x-rapidapi-host` + `x-rapidapi-key` headers  
**Base URL:** `https://twitter-api45.p.rapidapi.com`

| Method | Endpoint | Key param |
|--------|----------|-----------|
| `search_recent` | `GET /search.php` | `query`, `search_type=Latest`, `cursor` |
| `user_timeline` | `GET /timeline.php` | `screenname` (no `@`) |
| `conversation_replies` | `GET /latest_replies.php` | `id` (tweet_id) |
| _(user lookup)_ | `GET /screenname.php` | `screenname` |

### Operator compatibility

| Operator | Status | Handling |
|----------|--------|----------|
| `(kw1 OR kw2)` grouping | **Native** | Passed through unchanged |
| `min_faves:N` | **No native support** | Stripped before send; re-applied post-hoc (drops tweets with `favorites < N`) |
| `-is:retweet` | **No native support** | Stripped; re-applied post-hoc (drops tweets where `text` starts with `RT @`) |
| `-is:reply` | **No native support** | Stripped; re-applied post-hoc (drops tweets with `in_reply_to_status_id`) |
| `-is:nullcast` | **No native support** | Stripped; no post-hoc equivalent (nullcast tweets can't be detected from response) |
| `lang:XX` | **No native support** | Stripped; re-applied post-hoc (matches `lang` field in response) |
| `from:HANDLE` | **No equivalent** | Use `user_timeline` instead of a search query |
| `conversation_id:` | **No equivalent** | Mapped to `/latest_replies.php` endpoint |
| `since_id` | **No equivalent** | Emulated via snowflake ID comparison: `str(tweet_id) > since_id` (IDs are lexicographically ordered) |

### Response gotchas

**`views` is a string, not an int.** May be an empty string `""` or absent. The `_normalize` function converts to `int` if non-empty, `None` otherwise.

```python
# What you get:
{"views": "12345"}   # → impression_count = 12345
{"views": ""}        # → impression_count = None
{}                   # → impression_count = None
```

**`created_at` is RFC 822, not ISO 8601.** Parse with `email.utils.parsedate_to_datetime`, not `datetime.fromisoformat`.

```python
# What you get:
"Tue, 12 Mar 2024 04:12:30 +0000"
# NOT: "2024-03-12T04:12:30.000Z"
```

**`user_info` block may be absent.** Some tweet objects omit it entirely. Always use `.get("user_info") or {}`.

**No `conversation_id` field.** The API doesn't expose conversation threading data. `NormalizedTweet.conversation_id` is always `None` for this provider.

**Rate limits:** `x-ratelimit-requests-remaining` / `x-ratelimit-requests-reset` (Unix timestamp)

**Pagination:** `next_cursor` field in response. First request has no cursor; subsequent requests pass `cursor=<value>`.

---

## Choosing a provider

| Concern | x_official | twitter_api45 |
|---------|-----------|---------------|
| Operator fidelity | Full native support | OR-grouping only; rest post-hoc |
| `since_id` deduplication | Exact | Approximate (ID comparison) |
| Rate limits | Free tier: 500k tweets/month | Per RapidAPI plan |
| Reliability | Official; stable | Third-party; may break on X schema changes |
| Auth setup | Bearer token only | RapidAPI key + host header |
| `conversation_id` threading | Yes | No |

**Recommendation:** Use `x_official` when you have a valid Bearer token. Fall back to `twitter_api45` when the official API is unavailable or over quota. The lexicon queries were designed for X v2 operators — post-hoc filtering reduces precision slightly (you get more tweets through, then drop some in Python).

---

## Security note

Keys are loaded exclusively from `.env` — never from source code. The `.env` file is gitignored. If you fork this repo, copy `.env.example` to `.env` and fill in your own credentials.
