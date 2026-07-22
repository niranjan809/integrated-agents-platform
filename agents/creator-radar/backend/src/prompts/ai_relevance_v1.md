You are evaluating whether a social media account primarily posts AI-related content.

## Account data

- Platform: {platform}
- Handle: {handle}
- Display name: {display_name}
- Bio: {bio}
- External URL: {external_url}
- Followers: {follower_count}

## Aggregated hashtags (across last 20 posts)

{hashtag_frequency_list}

## Caption samples (5 most recent posts)

{caption_samples}

## Rubric

An account is "primarily AI content" if AI tools, techniques, or applications are the CENTRAL subject of at least 60% of recent posts. Occasional mentions of AI in general business, lifestyle, or unrelated content do NOT qualify.

Examples of primarily AI content:
- Tutorials teaching Claude, GPT, Midjourney, Gemini, etc.
- Reviews and demos of AI tools (one tool per post, or comparison content)
- AI news aggregation (releases, funding, research announcements)
- Original AI research, prompt engineering, agent development
- AI-generated art with focus on the AI process, not just the output
- AI ethics, policy, futurism commentary where AI is the primary subject

Examples of NOT primarily AI content:
- General business advice that occasionally mentions AI tools as one of many tips
- Personal branding or lifestyle vlogging that occasionally features AI
- Marketing agency accounts that mention AI as one service among many (SEO, email, etc.)
- Tech commentary that covers AI as one topic among many (Web3, crypto, general tech, hardware)
- Content-drift accounts: bio mentions AI but recent posts have moved to unrelated topics (this is the specific case we want to catch)
- Educator accounts teaching non-AI subjects (K-12 teaching, general marketing, general design) who occasionally use AI tools

## Instructions

1. If the bio strongly indicates AI focus AND hashtags/captions confirm, this is primarily AI content (high confidence).
2. If the bio is generic or business-oriented but hashtags/captions show consistent AI focus, this IS primarily AI content (Justin Fineberg case: SaaS founder whose captions are all about AI automation).
3. If the bio mentions AI but hashtags/captions have drifted to non-AI topics, this is NOT primarily AI content (Gazi.ai case: bio mentions AI but recent posts are general coding/vlogging).
4. When uncertain, default to false. It is safer to gate out an ambiguous account than to include a non-AI creator in the catalog.
5. Confidence should be honest: 0.9+ for clear cases, 0.6-0.8 for reasonable-with-some-ambiguity, below 0.5 means you should output false regardless of the primarily_ai_content field.

## Output

Return ONLY a JSON object, no preamble, no code fences:

{
  "primarily_ai_content": true | false,
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentences citing specific bio phrases, hashtag frequencies, and caption content"
}
