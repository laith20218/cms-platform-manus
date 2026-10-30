# ============================================================
# CMS API — Multi-stage Production Dockerfile
# ASP.NET Core 9 + Alpine + Non-root + Health Check
# ============================================================

# ---------- Stage 1: Restore ----------
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS restore
WORKDIR /src

COPY src/CMS.Api/CMS.Api.csproj src/CMS.Api/
COPY src/CMS.Application/CMS.Application.csproj src/CMS.Application/
COPY src/CMS.Domain/CMS.Domain.csproj src/CMS.Domain/
COPY src/CMS.Infrastructure/CMS.Infrastructure.csproj src/CMS.Infrastructure/
COPY CMS.sln ./

RUN dotnet restore src/CMS.Api/CMS.Api.csproj --locked-mode -r linux-musl-x64 /p:PublishReadyToRun=true

# ---------- Stage 2: Build ----------
FROM restore AS build
WORKDIR /src

COPY src/ src/
RUN dotnet build src/CMS.Api/CMS.Api.csproj -c Release -r linux-musl-x64 --no-restore

# ---------- Stage 3: Publish ----------
FROM build AS publish
RUN dotnet publish src/CMS.Api/CMS.Api.csproj \
    -c Release \
    -r linux-musl-x64 \
    -o /app/publish \
    --no-restore \
    --no-build \
    /p:UseAppHost=false \
    /p:PublishSingleFile=false \
    /p:PublishReadyToRun=true

# ---------- Stage 4: Runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime

# Metadata
LABEL org.opencontainers.image.title="CMS API" \
      org.opencontainers.image.description="College Medical System API" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.authors="CMS Team"

# Install required packages:
#   icu-libs + tzdata + wget + ca-certificates — globalization (Arabic), healthcheck, TLS
#   ffmpeg — Push 10.3 transcoding pipeline (HLS ladder 360p/720p/1080p). Alpine's ffmpeg
#   builds ship libx264 + aac encoders; the version pinning follows the Alpine release
#   the base image tracks (no host-side install at runtime).
#   ghostscript — Wave 11.9 PDF pre-processing pipeline (pdfwrite re-embedding of
#   broken/missing Arabic fonts before the fixed file lands in storage).
RUN apk add --no-cache icu-libs tzdata wget ca-certificates ffmpeg ghostscript && \
    rm -rf /var/cache/apk/*

# Transcoding pipeline knobs (Push 10.3 / Hotfix 10.6-2): binary discovery + per-job
# watchdog. 10 minutes — a standard encode that exceeds this on the memory-constrained
# free tier is stuck, not slow (env can still override at deploy time).
ENV FFMPEG_PATH=ffmpeg \
    FFPROBE_PATH=ffprobe \
    FFMPEG_TIMEOUT_MINUTES=10

# Wave 11.9 PDF pipeline knobs: binary discovery + OFL Arabic font pack + per-job
# watchdog (same "stuck, not slow" rationale as the FFmpeg timeout above).
ENV GS_PATH=gs \
    GHOSTSCRIPT_FONTS_PATH=/app/ghostscript-fonts \
    GS_TIMEOUT_MINUTES=10

# Set globalization invariant to false (Arabic support)
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
ENV DOTNET_RUNNING_IN_CONTAINER=true
ENV DOTNET_PRINT_TELEMETRY=false
ENV TZ=Asia/Riyadh

# Create non-root user
RUN addgroup -g 1001 -S cms && \
    adduser -u 1001 -S cms -G cms

WORKDIR /app

# Copy published artifacts
COPY --from=publish --chown=cms:cms /app/publish .

# Wave 11.9 — OFL Arabic font pack (Amiri + Noto Naskh Arabic, licenses included)
# consumed by Ghostscript via -sFONTPATH. Baked into the image: Render free-tier
# disks are ephemeral and the service builds straight from this Dockerfile.
COPY --chown=cms:cms assets/pdf-fonts/ /app/ghostscript-fonts/

# Create directories for logs + uploads
RUN mkdir -p /app/logs /app/uploads && \
    chown -R cms:cms /app

USER cms

EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health/live || exit 1

ENTRYPOINT ["dotnet", "CMS.Api.dll"]
