# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS runtime-base

FROM runtime-base AS workspace
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_DIST_DIR=.next
RUN npm install --global pnpm@11.25.0

# Install from manifests first so source edits can reuse the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/conversion/package.json packages/conversion/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

FROM workspace AS build
ARG CONVERTAL_API_URL=http://api:8787
COPY . .
RUN CONVERTAL_API_URL="$CONVERTAL_API_URL" pnpm build

# pnpm deploy creates a production-only, self-contained workspace installation.
RUN pnpm --filter @universal-convertal/api deploy --prod --legacy --frozen-lockfile /tmp/api-deploy \
  && cp -a apps/api/dist/. /tmp/api-deploy/dist/ \
  && cp THIRD_PARTY_NOTICES.md /tmp/api-deploy/THIRD_PARTY_NOTICES.md

FROM runtime-base AS api
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787
COPY --from=build --chown=node:node /tmp/api-deploy/ ./
USER node
EXPOSE 8787
CMD ["node", "dist/server.js"]

FROM runtime-base AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone/ ./
COPY --from=build --chown=node:node /workspace/apps/web/public/ ./apps/web/public/
COPY --from=build --chown=node:node /workspace/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=build --chown=node:node /workspace/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["node", "server.js"]
