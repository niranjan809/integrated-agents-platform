SEED_LEADERBOARDS = [
    {
        "name": "Open ASR Leaderboard",
        "publisher": "Hugging Face",
        "official_url": "https://huggingface.co/spaces/hf-audio/open_asr_leaderboard",
        "type": "Leaderboard",
        "domain": "STT",
        "primary_metrics": ["WER", "RTFx"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "Artificial Analysis STT Leaderboard",
        "publisher": "Artificial Analysis",
        "official_url": "https://artificialanalysis.ai/speech-to-text",
        "type": "Leaderboard",
        "domain": "STT",
        "primary_metrics": ["Accuracy", "Latency", "Price"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "Artificial Analysis TTS (Speech Arena)",
        "publisher": "Artificial Analysis",
        "official_url": "https://artificialanalysis.ai/text-to-speech/leaderboard",
        "type": "Leaderboard",
        "domain": "TTS",
        "primary_metrics": ["Elo", "Latency", "Price"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "VoiceBench",
        "publisher": "NUS + researchers",
        "official_url": "https://matthewcym.github.io/VoiceBench/",
        "type": "Leaderboard",
        "domain": "Voice Assistants",
        "primary_metrics": ["Overall Score", "AlpacaEval", "WildVoice", "MMSU"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "Speko STT Leaderboard",
        "publisher": "Speko",
        "official_url": "https://benchmarks.speko.ai/stt/",
        "type": "Leaderboard",
        "domain": "STT",
        "primary_metrics": ["WER", "Speed", "Cost"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "Speko TTS Leaderboard",
        "publisher": "Speko",
        "official_url": "https://benchmarks.speko.ai/tts",
        "type": "Leaderboard",
        "domain": "TTS",
        "primary_metrics": ["Voice Quality", "Latency", "Pricing"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "VoiceBenchmark.ai",
        "publisher": "Dasha AI",
        "official_url": "https://voicebenchmark.ai",
        "type": "Leaderboard",
        "domain": "Realtime Voice Agents",
        "primary_metrics": ["End-to-end Latency"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "CodeSOTA STT Leaderboard",
        "publisher": "CodeSOTA",
        "official_url": "https://www.codesota.com/speech/stt-leaderboard",
        "type": "Leaderboard",
        "domain": "STT",
        "primary_metrics": ["Mean WER"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "SpeechColab Leaderboard",
        "publisher": "SpeechColab",
        "official_url": "https://github.com/SpeechColab/Leaderboard",
        "type": "Leaderboard",
        "domain": "STT",
        "primary_metrics": ["TER", "mTER"],
        "availability": "Public",
        "notes": "Hosted on GitHub as a community leaderboard.",
    },
    {
        "name": "TTS Arena",
        "publisher": "TTS.ai",
        "official_url": "https://tts.ai/tools/tts-arena/",
        "type": "Arena",
        "domain": "TTS",
        "primary_metrics": ["MOS", "CER", "Speaker Similarity", "RTF"],
        "availability": "Public",
        "notes": None,
    },
    {
        "name": "VoiceWriter Speech Recognition Leaderboard",
        "publisher": "VoiceWriter",
        "official_url": "https://voicewriter.io/speech-recognition-leaderboard",
        "type": "Leaderboard",
        "domain": "STT",
        "primary_metrics": ["Mean WER"],
        "availability": "Public",
        "notes": None,
    },
    # LLM Leaderboards
    {
        "name": "Chatbot Arena",
        "publisher": "LMSYS",
        "official_url": "https://lmarena.ai/leaderboard",
        "type": "Arena",
        "domain": "LLM",
        "primary_metrics": ["Elo Rating", "Arena Score"],
        "availability": "Public",
        "notes": "Human-preference based ranking via pairwise battles. Subcategory: General Chat Models.",
    },
    {
        "name": "Artificial Analysis LLM Leaderboard",
        "publisher": "Artificial Analysis",
        "official_url": "https://artificialanalysis.ai/leaderboards/models",
        "type": "Leaderboard",
        "domain": "LLM",
        "primary_metrics": ["Quality", "Speed", "Price"],
        "availability": "Public",
        "notes": "Subcategory: General Evaluation.",
    },
    # Coding AI Leaderboards
    {
        "name": "LiveCodeBench Leaderboard",
        "publisher": "LiveCodeBench",
        "official_url": "https://livecodebench.github.io/leaderboard.html",
        "type": "Leaderboard",
        "domain": "Coding AI",
        "primary_metrics": ["Pass@1", "Easy", "Medium", "Hard"],
        "availability": "Public",
        "notes": "Subcategory: Code Generation.",
    },
    {
        "name": "SWE-bench Leaderboard",
        "publisher": "SWE-bench",
        "official_url": "https://www.swebench.com/",
        "type": "Leaderboard",
        "domain": "Coding AI",
        "primary_metrics": ["% Resolved"],
        "availability": "Public",
        "notes": "Subcategory: Software Engineering.",
    },
]


SEED_DOMAIN_CATEGORIES = [
    {
        "slug": "llm",
        "name": "LLM Leaderboards",
        "icon": "🤖",
        "description": "Large language model benchmarks, chat model evaluations, and general AI capability assessments.",
        "include_domains": ["LLM"],
        "exclude_domains": [],
        "display_order": 0,
        "is_builtin": 1,
        "accent_color": "purple",
    },
    {
        "slug": "voice-ai",
        "name": "Voice AI Leaderboards",
        "icon": "🎙",
        "description": "Speech-to-text, text-to-speech, voice assistants, and realtime voice agent benchmarks.",
        "include_domains": ["STT", "TTS", "Voice Assistants", "Realtime Voice Agents", "General"],
        "exclude_domains": [],
        "display_order": 1,
        "is_builtin": 1,
        "accent_color": "indigo",
    },
    {
        "slug": "coding",
        "name": "Coding AI Leaderboards",
        "icon": "💻",
        "description": "Code generation, software engineering, and programming AI capability benchmarks.",
        "include_domains": ["Coding AI"],
        "exclude_domains": [],
        "display_order": 2,
        "is_builtin": 1,
        "accent_color": "emerald",
    },
    {
        "slug": "vision-multimodal",
        "name": "Vision & Multimodal",
        "icon": "👁️",
        "description": "Image understanding, visual question answering, multimodal reasoning, and vision-language model benchmarks.",
        "include_domains": ["Vision & Multimodal"],
        "exclude_domains": [],
        "display_order": 3,
        "is_builtin": 1,
        "accent_color": "violet",
    },
    {
        "slug": "image-generation",
        "name": "Image Generation",
        "icon": "🎨",
        "description": "Text-to-image, image quality, aesthetics, and generative image model benchmarks.",
        "include_domains": ["Image Generation"],
        "exclude_domains": [],
        "display_order": 4,
        "is_builtin": 1,
        "accent_color": "rose",
    },
    {
        "slug": "video-ai",
        "name": "Video AI",
        "icon": "🎬",
        "description": "Video generation, video understanding, temporal reasoning, and video model benchmarks.",
        "include_domains": ["Video AI"],
        "exclude_domains": [],
        "display_order": 5,
        "is_builtin": 1,
        "accent_color": "orange",
    },
    {
        "slug": "document-ai",
        "name": "Document AI / OCR",
        "icon": "📄",
        "description": "Optical character recognition, document parsing, table extraction, and document understanding benchmarks.",
        "include_domains": ["Document AI"],
        "exclude_domains": [],
        "display_order": 6,
        "is_builtin": 1,
        "accent_color": "teal",
    },
    {
        "slug": "ai-agents",
        "name": "AI Agents",
        "icon": "🕵️",
        "description": "Autonomous agent benchmarks, tool use, web navigation, long-horizon task completion, and agentic reasoning.",
        "include_domains": ["AI Agents"],
        "exclude_domains": [],
        "display_order": 7,
        "is_builtin": 1,
        "accent_color": "sky",
    },
    {
        "slug": "robotics",
        "name": "Robotics",
        "icon": "🦾",
        "description": "Robot manipulation, locomotion, embodied AI, simulation-to-real transfer, and physical task benchmarks.",
        "include_domains": ["Robotics"],
        "exclude_domains": [],
        "display_order": 8,
        "is_builtin": 1,
        "accent_color": "lime",
    },
    {
        "slug": "ai-safety",
        "name": "AI Safety & Security",
        "icon": "🛡️",
        "description": "Alignment, red-teaming, jailbreak resistance, truthfulness, bias evaluation, and AI safety benchmarks.",
        "include_domains": ["AI Safety & Security"],
        "exclude_domains": [],
        "display_order": 9,
        "is_builtin": 1,
        "accent_color": "amber",
    },
]


def run_seed(db):
    from models import Leaderboard, SeedExclusion
    existing_urls = {lb.official_url for lb in db.query(Leaderboard).all()}
    excluded_urls = {ex.official_url for ex in db.query(SeedExclusion).all()}
    added = 0
    for data in SEED_LEADERBOARDS:
        url = data["official_url"]
        if url not in existing_urls and url not in excluded_urls:
            lb = Leaderboard(**data, status="pending", source="seed")
            db.add(lb)
            added += 1
    if added:
        db.commit()
        print(f"Seeded {added} new leaderboards.")


DOMAIN_FIXES = {
    "https://lmarena.ai/leaderboard": "LLM",
    "https://artificialanalysis.ai/leaderboards/models": "LLM",
    "https://livecodebench.github.io/leaderboard.html": "Coding AI",
    "https://www.swebench.com/": "Coding AI",
}


def fix_domain_corruption(db):
    """Restore correct domains that the normalizer may have overwritten with 'General'."""
    from models import Leaderboard
    fixed = 0
    for url, correct_domain in DOMAIN_FIXES.items():
        lb = db.query(Leaderboard).filter(Leaderboard.official_url == url).first()
        if lb and lb.domain != correct_domain:
            print(f"  Fixing domain for '{lb.name}': {lb.domain!r} → {correct_domain!r}")
            lb.domain = correct_domain
            fixed += 1
    if fixed:
        db.commit()
        print(f"Fixed domain for {fixed} leaderboard(s).")


def seed_domain_categories(db):
    from models import DomainCategory
    existing_slugs = {c.slug for c in db.query(DomainCategory).all()}
    added = 0
    for data in SEED_DOMAIN_CATEGORIES:
        if data["slug"] not in existing_slugs:
            cat = DomainCategory(**data)
            db.add(cat)
            added += 1
    if added:
        db.commit()
        print(f"Seeded {added} domain categories.")


def fix_category_configs(db):
    """Switch voice-ai from catch-all to explicit include list so new domain grids don't bleed into it."""
    from models import DomainCategory
    voice_ai = db.query(DomainCategory).filter(DomainCategory.slug == "voice-ai").first()
    if voice_ai and not voice_ai.include_domains:
        voice_ai.include_domains = ["STT", "TTS", "Voice Assistants", "Realtime Voice Agents", "General"]
        voice_ai.exclude_domains = []
        db.commit()
        print("Updated voice-ai to explicit include list.")


def seed_prompts(db):
    from models import PromptConfig
    from agent.prompt_store import DEFAULTS
    existing = {p.key for p in db.query(PromptConfig).all()}
    added = 0
    for key, meta in DEFAULTS.items():
        if key not in existing:
            db.add(PromptConfig(key=key, label=meta["label"],
                                description=meta["description"],
                                prompt_text=meta["prompt_text"]))
            added += 1
    if added:
        db.commit()
        print(f"Seeded {added} prompt configuration(s).")
