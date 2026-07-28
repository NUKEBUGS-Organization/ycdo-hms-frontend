# ---- Build ----
FROM node:20-alpine AS build

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .

# prisma generate validates schema env() refs but does not connect to the DB
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

# Wipe incremental cache from the host — otherwise nest/tsc can exit 0 and emit nothing
# when tsbuildinfo is present but dist/ was excluded by .dockerignore.
RUN rm -rf dist *.tsbuildinfo \
  && npx prisma generate \
  && npm run build \
  && echo "===== dist layout =====" \
  && ls -R dist \
  && echo "===== locate main.js / seed.js =====" \
  && find dist -name 'main.js' -o -name 'seed.js' | sort \
  && if [ -f dist/src/main.js ] && [ ! -f dist/main.js ]; then \
       echo "NORMALIZING nested dist/src → dist/"; \
       cp -a dist/src/. dist/ && rm -rf dist/src; \
     fi \
  && test -f dist/main.js \
  || (echo "FATAL: dist/main.js missing after nest build" && ls -R dist; exit 1) \
  && test -f dist/prisma/seed.js \
  || (echo "FATAL: dist/prisma/seed.js missing after nest build" && ls -R dist; exit 1)

# ---- Production ----
FROM node:20-alpine AS production

RUN apk add --no-cache openssl libc6-compat dumb-init \
  && addgroup -S nodejs \
  && adduser -S nestjs -G nodejs

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY package*.json ./
COPY prisma ./prisma/
# Placeholder only for generate during image build — real URL comes from CapRover at runtime
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npm ci --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

# Write entrypoint inside the image (avoids Windows CRLF → "No such file or directory")
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  'if [ -z "$DATABASE_URL" ]; then' \
  '  echo "ERROR: DATABASE_URL is not set."' \
  '  echo "Set it in CapRover → App Configs → Environment Variables."' \
  '  exit 1' \
  'fi' \
  'if [ -z "$BRANCH_ID" ] || [ -z "$BRANCH_CODE" ]; then' \
  '  echo "ERROR: BRANCH_ID and BRANCH_CODE must be set."' \
  '  exit 1' \
  'fi' \
  'if [ ! -f dist/main.js ]; then' \
  '  echo "ERROR: dist/main.js missing. Dist contents:"' \
  '  ls -R dist || true' \
  '  exit 1' \
  'fi' \
  'echo "Running prisma migrate deploy..."' \
  './node_modules/.bin/prisma migrate deploy' \
  'echo "Starting API on port ${PORT:-80}..."' \
  'exec node dist/main.js' \
  > /app/docker-entrypoint.sh \
  && chmod +x /app/docker-entrypoint.sh \
  && chown -R nestjs:nodejs /app

USER nestjs

# Clear build placeholder so a missing CapRover env fails loudly at start
ENV DATABASE_URL=

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["/bin/sh", "/app/docker-entrypoint.sh"]
