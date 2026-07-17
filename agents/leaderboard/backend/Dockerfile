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

# Re-install the Chromium build that matches whatever Playwright version pip
# resolved. The base image ships v1.44.0's browser, but requirements.txt pins
# Playwright unbounded, so pip may install a newer version whose Chromium build
# differs — causing chromium.launch() to fail on JS-rendered leaderboards.
RUN playwright install chromium --with-deps

# App code
COPY . .

# Railway injects $PORT at runtime
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
