# PaperTrail web app. Build context: the repository root (see docker-compose.yml).
FROM node:22-alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
# The optional "extra_ca" build secret is only for networks that intercept TLS.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export npm_config_cafile=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
# Baked into the /api forwarding rule at build time.
ARG PAPERTRAIL_API_URL=http://api:8000
ENV PAPERTRAIL_API_URL=$PAPERTRAIL_API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
