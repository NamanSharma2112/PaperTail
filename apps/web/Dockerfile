# PaperTrail web application (UI + API). Build context: the repository root.
#   docker build -f apps/web/Dockerfile -t papertrail .
FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
# The optional "extra_ca" build secret is only for networks that intercept TLS.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export npm_config_cafile=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 PILOT_DIR=/app/pilot/gcn-kipf-welling-2017
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Migrations, the migration runner and the demo loader run inside the container.
COPY --chown=node:node db/migrations ./db/migrations
COPY --chown=node:node apps/web/scripts ./scripts
COPY --chown=node:node pilot/gcn-kipf-welling-2017 ./pilot/gcn-kipf-welling-2017
COPY --chown=node:node apps/web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=10 \
    CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
