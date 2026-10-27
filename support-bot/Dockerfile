# Mox Support Bot — production image.
#
# Two stages so better-sqlite3 gets a real toolchain to compile against, but
# the compiler never ships. Final image is node:22.23.4-slim + node_modules + dist.
#
# Build context is support-bot/ (set Root Directory = support-bot in Railway).

FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 falls back to node-gyp when no prebuild matches the platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev


FROM node:22.23.4-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# package.json is read at runtime for the version in the boot DM.
COPY package.json ./

# Runtime assets. db.ts resolves migrations/ relative to cwd; config.ts reads
# config.yaml and prompts/ the same way. All three must be in the image.
COPY migrations ./migrations
COPY prompts ./prompts
COPY config.yaml ./config.yaml

# DATABASE_PATH and PHOTO_DIR point here; mount the Railway volume at /data.
RUN mkdir -p /data

EXPOSE 8080
CMD ["node", "dist/src/index.js"]
