# The backend scrapes with Playwright, so the image needs a Chromium build plus
# its OS-level libraries. The official Playwright image ships both, and the tag
# is pinned to the exact playwright version in package-lock.json (1.61.1) —
# a mismatched image would carry browser revisions this version won't launch.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS base
WORKDIR /app

# Pin the browser location to the base image's pre-installed path. Set before
# npm ci so install and runtime resolve the same directory: without it, launch
# fell back to a per-user path (/home/<user>/pw-browsers) that has no Chromium,
# so every scrape failed and runs produced no evidence.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Deps first, so a source-only change doesn't reinstall node_modules.
COPY package.json package-lock.json ./
RUN npm ci

# Build: tsc emits JS, then copy-assets.mjs brings src/db/schema.sql across to
# dist/db/ (migrate.ts reads it relative to its own compiled location).
COPY . .
RUN npm run build

# Fallback if a build still reports a missing browser — i.e. this image tag
# stopped shipping Chromium at /ms-playwright. Installs the revision npm ci
# resolved into the pinned path. Left off by default: re-installing is what
# scattered the browser across paths in the first place.
# RUN npx playwright install chromium

ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "dist/index.js"]
