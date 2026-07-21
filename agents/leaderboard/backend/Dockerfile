FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

# System deps (fonts for non-Latin leaderboard names)
RUN apt-get update && apt-get install -y \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install the Chromium build (+ system deps) that matches the pinned Playwright.
# The base image ships v1.44.0's browser, but requirements.txt pins Playwright to a
# newer, tested version (1.61.0), whose Chromium build differs — so we reinstall the
# matching one here. Without this, chromium.launch() fails on JS-rendered
# leaderboards (the "Executable doesn't exist" version mismatch). Pinning the package
# keeps this reproducible: every build resolves the same Playwright + browser pair.
RUN playwright install chromium --with-deps

# App code
COPY . .

# Railway injects $PORT at runtime
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
