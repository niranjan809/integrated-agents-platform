You are classifying a social media account (Instagram or TikTok) into one AI content creator category. This is a fallback classifier — deterministic rules already tried and were inconclusive.

## Account data

- Handle: {handle}
- Display name: {display_name}
- Bio: {bio}
- External URL: {external_url}
- Followers: {follower_count} | Following: {following_count} | Posts: {post_count}
- Engagement rate: {engagement_rate}
- Post cadence: {posts_per_week_last_8w} posts/week (last 8 weeks)

## Recent posts (last 20)

{posts_formatted}
(Each: [posted_at | media_type | likes L / comments C] caption #hashtags)

## Categories (pick exactly one)

- AI Educator — tutorials, step-by-step, prompt engineering, "how to"
- AI Tool Reviewer — demos and reviews of specific AI tools
- AI News/Aggregator — shares AI releases and headlines, mostly curation
- AI Business/B2B — enterprise/workflow/professional angle
- AI Trend/Viral — AI trends and memes, "look what AI made" style
- AI Promoter — primarily self-promotes an AI product/service
- Hybrid Creator+Promoter — original content AND product self-promotion
- Uncategorized — genuinely doesn't fit above

## Instructions

1. Captions are often minimal (especially on Instagram; more variable on TikTok). Weight bio, hashtags, and content pattern heavily.
2. `category_confidence` should be honest — below 0.5 means Uncategorized.
3. `ai_content_fraction` is fraction of shown posts that are AI-related (0.0–1.0).

## Output (JSON only, no preamble, no fences)

{
  "category": "...",
  "category_confidence": 0.0,
  "ai_content_fraction": 0.0,
  "reasoning": "2-3 sentences citing specific signals"
}
