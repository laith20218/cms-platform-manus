# ============================================================
# CMS Student Web — Multi-stage Production Dockerfile
# React 19 + Vite 6 + Nginx (serve) + PWA
# ============================================================

# ---------- Stage 1: Build ----------
FROM docker.io/library/node:22-alpine AS build
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace configuration and complete sources before installation. Pnpm
# must see each workspace package at install time to create valid links for
# Vite and the PWA plugin in a clean container build.
COPY package.json pnpm-workspace.yaml turbo.json pnpm-lock.yaml ./
COPY apps/student-web/ ./apps/student-web/
COPY packages/ ./packages/

# The isolated layout preserves pnpm peer-dependency wiring for Vite plugins
# such as vite-plugin-pwa and workbox-build in a clean container build.
RUN pnpm install --frozen-lockfile --config.node-linker=isolated

# Build arguments (for env injection)
ARG VITE_API_URL=/api/v1
ARG VITE_APP_ENV=production
ARG VITE_APP_VERSION=1.0.0

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_ENV=$VITE_APP_ENV
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Build the student web app
RUN pnpm --filter @cms/student-web build

# ---------- Stage 2: Runtime (Nginx) ----------
FROM docker.io/library/nginx:1.27-alpine AS runtime

# Metadata
LABEL org.opencontainers.image.title="CMS Student Web" \
      org.opencontainers.image.description="College Medical System — Student Frontend" \
      org.opencontainers.image.version="1.0.0"

# Install required packages
RUN apk add --no-cache curl tzdata && \
    rm -rf /var/cache/apk/*

# Set timezone
ENV TZ=Asia/Riyadh

# Copy custom nginx config
COPY deploy/nginx/nginx-student-web.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/apps/student-web/dist /usr/share/nginx/html

# The packaged Nginx master starts with the minimum bootstrap privilege needed
# to bind 80/443; its worker processes run as the image's nginx user. Running
# the whole container as an arbitrary user would make the required HTTPS ports fail.

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
