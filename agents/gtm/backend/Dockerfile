# The backend scrapes with Playwright, so the image needs a Chromium build plus
# its OS-level libraries. The official Playwright image ships both, and the tag
# is pinned to the exact playwright version in package-lock.json (1.61.1) —
# a mismatched image would carry browser revisions this version won't launch.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS base
WORKDIR /app

# Deps first, so a source-only change doesn't reinstall node_modules.
COPY package.json package-lock.json ./
RUN npm ci

# Build: tsc emits JS, then copy-assets.mjs brings src/db/schema.sql across to
# dist/db/ (migrate.ts reads it relative to its own compiled location).
COPY . .
RUN npm run build

# Belt-and-braces: the base image pre-installs browsers at
# PLAYWRIGHT_BROWSERS_PATH, this verifies the revision npm ci resolved is there.
RUN npx playwright install chromium

ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "dist/index.js"]
