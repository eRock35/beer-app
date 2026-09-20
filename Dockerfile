# syntax=docker/dockerfile:1

# ---- build the client and install production deps ----
FROM node:22-slim AS build
WORKDIR /app

# better-sqlite3 is a native addon; the local dev driver needs a toolchain to
# compile it. The runtime stage below drops all of this.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY server ./server
COPY web ./web
RUN npm run build -w web

# Re-resolve with dev dependencies stripped, so Vite and friends stay out of the image.
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist

# Cloud Run injects PORT; 8080 is its default and a sane local fallback.
ENV PORT=8080
EXPOSE 8080

# Never run as root.
USER node

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
