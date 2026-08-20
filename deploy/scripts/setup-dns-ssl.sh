#!/bin/bash
# ============================================================
# CMS Platform — DNS + SSL Configuration Script
# Sets up Cloudflare DNS records + SSL certificates
# ============================================================
set -e

# ============================================================
# CONFIGURATION (override via environment variables)
# ============================================================
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
DOMAIN="${DOMAIN:-cms.example.com}"

# Service URLs (from Vercel + Railway)
VERCEL_STUDENT_URL="${VERCEL_STUDENT_URL:-cname.vercel-dns.com}"
VERCEL_ADMIN_URL="${VERCEL_ADMIN_URL:-cname.vercel-dns.com}"
RAILWAY_API_URL="${RAILWAY_API_URL:-cms-production.up.railway.app}"
R2_PUBLIC_HOST="${R2_PUBLIC_HOST:-pub-xxx.r2.dev}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

echo "╔══════════════════════════════════════════════╗"
echo "║   CMS Platform — DNS + SSL Setup            ║"
echo "║   Domain: $DOMAIN"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ============================================================
# 1. VALIDATION
# ============================================================
if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    error "Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID"
    echo ""
    echo "Get them from: https://dash.cloudflare.com/profile/api-tokens"
    echo "Required token permissions:"
    echo "  - Zone:DNS:Edit"
    echo "  - Zone:Zone:Read"
    exit 1
fi

API_BASE="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

info "Cloudflare credentials found"
echo ""

# ============================================================
# 2. CREATE DNS RECORDS
# ============================================================
create_dns_record() {
    local type=$1 name=$2 content=$3 proxied=$4
    
    echo "→ Creating $type record: $name → $content (proxied: $proxied)"
    
    RESPONSE=$(curl -s -X POST "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"$type\",
            \"name\": \"$name\",
            \"content\": \"$content\",
            \"ttl\": 1,
            \"proxied\": $proxied
        }")
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        info "  $name.$DOMAIN → $content"
    else
        error "  Failed to create $name record"
        echo "  Response: $RESPONSE"
        return 1
    fi
}

echo "→ Setting up DNS records..."
echo ""

# Main domain (root) → Vercel student app
create_dns_record "A" "@" "76.76.21.21" "true"

# Subdomains
create_dns_record "CNAME" "app" "$VERCEL_STUDENT_URL" "true"
create_dns_record "CNAME" "admin" "$VERCEL_ADMIN_URL" "true"
create_dns_record "CNAME" "api" "$RAILWAY_API_URL" "true"
create_dns_record "CNAME" "cdn" "$R2_PUBLIC_HOST" "true"

# Email (MX records for transactional emails)
create_dns_record "MX" "@" "mx.sendgrid.net" "false"

# TXT records for verification
create_dns_record "TXT" "@" "v=spf1 include:sendgrid.net ~all" "false"

echo ""
info "DNS records created successfully"
echo ""

# ============================================================
# 3. SSL CONFIGURATION
# ============================================================
echo "→ Configuring SSL settings..."
echo ""

# Set SSL mode to "Full (strict)" — requires valid cert on origin
SSL_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/ssl" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"strict"}')

if echo "$SSL_RESPONSE" | grep -q '"success":true'; then
    info "SSL mode set to Full (strict)"
else
    warn "Failed to set SSL mode (may already be set)"
fi

# Enable Always Use HTTPS
HTTPS_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/always_use_https" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"on"}')

if echo "$HTTPS_RESPONSE" | grep -q '"success":true'; then
    info "Always Use HTTPS enabled"
else
    warn "Failed to enable Always Use HTTPS"
fi

# Enable HSTS
HSTS_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/security_header" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{
        "strict_transport_security": {
            "enabled": true,
            "max_age": 63072000,
            "include_subdomains": true,
            "preload": true
        }
    }')

if echo "$HSTS_RESPONSE" | grep -q '"success":true'; then
    info "HSTS enabled (max-age=2 years, preload)"
else
    warn "Failed to enable HSTS"
fi

# Enable TLS 1.3
TLS_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/tls_1_3" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"on"}')

if echo "$TLS_RESPONSE" | grep -q '"success":true'; then
    info "TLS 1.3 enabled"
else
    warn "Failed to enable TLS 1.3"
fi

# Enable Automatic HTTPS Rewrites
REWRITE_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/automatic_https_rewrites" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"on"}')

if echo "$REWRITE_RESPONSE" | grep -q '"success":true'; then
    info "Automatic HTTPS Rewrites enabled"
else
    warn "Failed to enable Automatic HTTPS Rewrites"
fi

echo ""

# ============================================================
# 4. SECURITY SETTINGS
# ============================================================
echo "→ Configuring security settings..."
echo ""

# Enable Bot Fight Mode
BOT_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/bot_management" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"enable_bot_fight_mode":true}')

# Note: Bot Management requires Pro plan, may fail on free tier
if echo "$BOT_RESPONSE" | grep -q '"success":true'; then
    info "Bot Fight Mode enabled"
else
    warn "Bot Fight Mode requires Pro plan (skipped)"
fi

# Set Security Level to Medium
SEC_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/security_level" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"medium"}')

if echo "$SEC_RESPONSE" | grep -q '"success":true'; then
    info "Security level set to Medium"
else
    warn "Failed to set security level"
fi

# Enable Browser Integrity Check
BIC_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/browser_check" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"on"}')

if echo "$BIC_RESPONSE" | grep -q '"success":true'; then
    info "Browser Integrity Check enabled"
else
    warn "Failed to enable Browser Integrity Check"
fi

echo ""

# ============================================================
# 5. PERFORMANCE SETTINGS
# ============================================================
echo "→ Configuring performance settings..."
echo ""

# Enable Auto Minify (HTML + CSS + JS)
MINIFY_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/minify" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":{"html":true,"css":true,"js":true}}')

if echo "$MINIFY_RESPONSE" | grep -q '"success":true'; then
    info "Auto Minify enabled (HTML+CSS+JS)"
else
    warn "Failed to enable Auto Minify"
fi

# Enable Brotli compression
BROTLI_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/brotli" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"on"}')

if echo "$BROTLI_RESPONSE" | grep -q '"success":true'; then
    info "Brotli compression enabled"
else
    warn "Failed to enable Brotli"
fi

# Set Cache Level to Aggressive
CACHE_RESPONSE=$(curl -s -X PATCH "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/settings/cache_level" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    --data '{"value":"aggressive"}')

if echo "$CACHE_RESPONSE" | grep -q '"success":true'; then
    info "Cache level set to Aggressive"
else
    warn "Failed to set cache level"
fi

echo ""

# ============================================================
# 6. PAGE RULES ( redirects + caching )
# ============================================================
echo "→ Creating Page Rules..."
echo ""

create_page_rule() {
    local url=$1 actions=$2
    
    RESPONSE=$(curl -s -X POST "$API_BASE/zones/$CLOUDFLARE_ZONE_ID/pagerules" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        --data "{
            \"targets\": [{
                \"target\": \"url\",
                \"constraint\": {\"operator\": \"matches\", \"value\": \"$url\"}
            }],
            \"actions\": $actions,
            \"priority\": 1,
            \"status\": \"active\"
        }")
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        info "Page rule created for: $url"
    else
        warn "Failed to create page rule for: $url"
    fi
}

# Redirect HTTP → HTTPS for all
create_page_rule "http://*.$DOMAIN/*" \
    '[{"id":"always_use_https","value":"on"}]'

# Cache everything on static assets (1 day browser cache)
create_page_rule "*.$DOMAIN/assets/*" \
    '[{"id":"browser_cache_ttl","value":86400},{"id":"cache_level","value":"cache_everything"}]'

# Bypass cache on API
create_page_rule "api.$DOMAIN/*" \
    '[{"id":"cache_level","value":"bypass"}]'

echo ""

# ============================================================
# 7. VERIFICATION
# ============================================================
echo "→ Waiting 30s for DNS propagation..."
sleep 30
echo ""

echo "→ Verifying DNS records..."
echo ""

verify_dns() {
    local subdomain=$1 type=$2
    local full="${subdomain:+$subdomain.}$DOMAIN"
    
    RESULT=$(dig +short "$full" "$type" 2>/dev/null | head -1)
    if [ -n "$RESULT" ]; then
        info "$full ($type) → $RESULT"
    else
        warn "$full ($type) → not yet propagated"
    fi
}

verify_dns "" "A"
verify_dns "app" "CNAME"
verify_dns "admin" "CNAME"
verify_dns "api" "CNAME"
verify_dns "cdn" "CNAME"

echo ""

# ============================================================
# 8. SSL CERTIFICATE VERIFICATION
# ============================================================
echo "→ Verifying SSL certificates..."
echo ""

verify_ssl() {
    local subdomain=$1
    local full="${subdomain:+$subdomain.}$DOMAIN"
    
    EXPIRY=$(echo | openssl s_client -servername "$full" -connect "$full:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null \
        | cut -d= -f2)
    
    if [ -n "$EXPIRY" ]; then
        info "$full SSL valid until: $EXPIRY"
    else
        warn "$full SSL not yet issued (Cloudflare Universal SSL takes ~15 min)"
    fi
}

verify_ssl ""
verify_ssl "app"
verify_ssl "admin"
verify_ssl "api"

echo ""

# ============================================================
# 9. SUMMARY
# ============================================================
echo "╔══════════════════════════════════════════════╗"
echo "║   ✓ DNS + SSL Setup Complete!                ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║   DNS Records created:                       ║"
echo "║     • $DOMAIN (A)                            ║"
echo "║     • app.$DOMAIN (CNAME → Vercel)           ║"
echo "║     • admin.$DOMAIN (CNAME → Vercel)         ║"
echo "║     • api.$DOMAIN (CNAME → Railway)          ║"
echo "║     • cdn.$DOMAIN (CNAME → R2)               ║"
echo "║                                              ║"
echo "║   SSL Configuration:                         ║"
echo "║     • Mode: Full (strict)                    ║"
echo "║     • TLS 1.3: Enabled                       ║"
echo "║     • HSTS: Enabled (2 years + preload)      ║"
echo "║     • Auto HTTPS Rewrites: Enabled           ║"
echo "║                                              ║"
echo "║   Next steps:                                ║"
echo "║     1. Wait 15 min for Universal SSL         ║"
echo "║     2. Run: ./smoke-tests.sh                 ║"
echo "║     3. Submit HSTS preload list:             ║"
echo "║        https://hstspreload.org               ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
