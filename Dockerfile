FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ pkg-config libcairo2-dev libpango1.0-dev \
    libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 DATA_DIR=/app/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/examples ./examples
COPY --from=build --chown=node:node /app/docs ./docs
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/.runtime/openmaic/.next/standalone ./.runtime/openmaic/.next/standalone
COPY --from=build --chown=node:node /app/.runtime/openmaic/public ./.runtime/openmaic/public
COPY --from=build --chown=node:node /app/.runtime/openmaic/.studyloop-build.json ./.runtime/openmaic/.studyloop-build.json
# Keep the exact upstream source, downstream changes, and rebuilding tools with
# the distributed classroom, including its LGPL-covered formula converter.
COPY --from=build --chown=node:node /app/vendor ./vendor
COPY --from=build --chown=node:node /app/integrations ./integrations
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/LICENSE /app/THIRD_PARTY_NOTICES.md ./
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3210/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
