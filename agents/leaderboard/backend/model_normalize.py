import re

# Well-known company/publisher names that prefix model names in some leaderboards
# e.g. "Google Gemini 2.5 Flash" → strip "google" → {gemini, 2.5, flash}
_COMPANY_PREFIXES = {
    "google", "openai", "anthropic", "microsoft", "meta", "amazon", "aws",
    "deepmind", "nvidia", "deepgram", "assemblyai", "elevenlabs",
    "azure", "cohere", "mistral", "baidu", "alibaba", "speechmatics",
    "gladia", "groq", "xai", "inflection", "adept",
}


def canonical_tokens(name: str) -> frozenset:
    """
    Reduce a model name to an order-independent frozenset of tokens.

    Steps:
      1. Lowercase + collapse separators (-, _, ., /) to spaces
      2. Strip any leading known company-name tokens
      3. Return frozenset (order-independent matching)

    Examples:
      "whisper-large-v3"          → {whisper, large, v3}
      "Whisper V3 Large"          → {whisper, v3, large}  (same set)
      "Google Gemini 2.5 Flash"   → {gemini, 2.5, flash}  (google stripped)
      "GPT-4"                     → {gpt, 4}
      "GPT-4o"                    → {gpt, 4o}             (different — preserved)
    """
    s = name.lower().strip()
    s = re.sub(r"[-_./]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    tokens = s.split()
    while tokens and tokens[0] in _COMPANY_PREFIXES:
        tokens = tokens[1:]
    return frozenset(tokens) if tokens else frozenset({s})


def model_matches_suggest(query: str, candidate: str) -> bool:
    """
    Autocomplete matching: handles mid-word typing.
    - Company prefixes are stripped from BOTH query and candidate so that
      typing "google gemini" or just "gemini" both surface "Google Gemini 2.5 Flash".
    - All tokens except the last must be exact matches in the candidate.
    - The last token only needs to be a PREFIX of any candidate token.

    Examples (typing in progress):
      "whisp"          → last="whisp"  → "whisper".startswith("whisp") ✓
      "whisper lar"    → "whisper" exact, "lar" prefix of "large"       ✓
      "google gemini"  → strip "google" from query, "gemini" prefix of "gemini" ✓
      "gemini 2"       → "gemini" exact, "2" prefix of "2" or "2.5"    ✓
    """
    s = re.sub(r"[-_./]", " ", query.lower().strip())
    s = re.sub(r"\s+", " ", s).strip()
    q_tokens = s.split()
    # Strip company prefixes from query (same as canonical_tokens does)
    while q_tokens and q_tokens[0] in _COMPANY_PREFIXES:
        q_tokens = q_tokens[1:]
    if not q_tokens:
        return False

    # Strip company prefixes from candidate
    cs = re.sub(r"[-_./]", " ", candidate.lower().strip())
    cs = re.sub(r"\s+", " ", cs)
    c_tokens = cs.split()
    while c_tokens and c_tokens[0] in _COMPANY_PREFIXES:
        c_tokens = c_tokens[1:]
    c_set = set(c_tokens)

    # All complete (non-last) tokens must match exactly
    for qt in q_tokens[:-1]:
        if qt not in c_set:
            return False

    # Last token: prefix match against any candidate token
    last = q_tokens[-1]
    return any(ct.startswith(last) for ct in c_set)


def model_matches(query: str, candidate: str, *, partial: bool = False) -> bool:
    """
    Compare two model names after canonical normalization.

    partial=False (default) — exact set equality: used when fetching compare
        results so "whisper-large-v3" does NOT pull in "whisper-large-v3-turbo".

    partial=True — subset check: used for autocomplete suggestions so typing
        "whisper large" surfaces "whisper-large-v3", "whisper-large-v3-turbo", etc.
    """
    q = canonical_tokens(query)
    c = canonical_tokens(candidate)
    if not q:
        return False
    return q.issubset(c) if partial else q == c
