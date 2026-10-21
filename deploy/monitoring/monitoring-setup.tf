# ============================================================
# CMS Platform — Production Monitoring Setup
# Sentry + Better Stack + Slack Alerts
# ============================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    sentry = {
      source  = "jhoman/sentry"
      version = "~> 0.12.0"
    }
    betteruptime = {
      source  = "BetterStackHQ/betteruptime"
      version = "~> 0.10.0"
    }
  }

  # Backend configuration — use remote state in production:
  # backend "s3" {
  #   bucket = "cms-terraform-state"
  #   key    = "monitoring/terraform.tfstate"
  #   region = "eu-central-1"
  # }
}

# ───────────────────────────────────────────────────────────
# Providers (configure via env vars: SENTRY_AUTH_TOKEN, BETTERUPTIME_API_TOKEN)
# ───────────────────────────────────────────────────────────

provider "sentry" {
  # Set SENTRY_AUTH_TOKEN and SENTRY_ORG_SLUG env vars
  # export SENTRY_AUTH_TOKEN="..."
  # export SENTRY_ORG_SLUG="cms"
}

provider "betteruptime" {
  # Set BETTERUPTIME_API_TOKEN env var
  # export BETTERUPTIME_API_TOKEN="..."
}

# ───────────────────────────────────────────────────────────
# 1. SENTRY (Backend + Frontend Error Tracking)
# ───────────────────────────────────────────────────────────

resource "sentry_project" "cms_backend" {
  organization = "cms"
  team         = "cms-engineering"
  name         = "cms-backend"
  slug         = "cms-backend"
  platform     = "csharp"

  # Error + Performance monitoring
  resolve_age    = 30
  facility       = "projects"
  is_bookmarked  = false
  digest_min_delay = 5
  digest_max_delay = 30
}

resource "sentry_project" "cms_frontend" {
  organization = "cms"
  team         = "cms-engineering"
  name         = "cms-frontend"
  slug         = "cms-frontend"
  platform     = "javascript-react"

  resolve_age = 30
}

# Alert rules
resource "sentry_rule" "backend_high_error_rate" {
  organization = "cms"
  project      = sentry_project.cms_backend.id
  name         = "High Error Rate Alert"
  action_match = "all"
  filter_match = "any"

  conditions = [
    {
      id    = "sentry.rules.conditions.first_seen_event"
      name  = "A new issue is created"
    },
    {
      id    = "sentry.rules.conditions.event_frequency"
      name  = "The issue is seen more than 10 times in 1 hour"
      value = 10
    }
  ]

  actions = [
    {
      id              = "sentry.integrations.slack.notify_action"
      name            = "Send Slack notification"
      workspace       = "CMS"
      channel         = "#alerts-critical"
      include_tags    = true
    }
  ]
}

# ───────────────────────────────────────────────────────────
# 2. BETTER STACK (Uptime Monitoring)
# ───────────────────────────────────────────────────────────

resource "betteruptime_monitor" "api_health" {
  name           = "CMS API — Health Check"
  url            = "https://api.cms.example.com/health"
  monitor_type   = "status"
  expected_status_code = 200
  request_timeout = 30
  confirmation_type = "required"
  confirmation_attempts = 3

  # Check every 30 seconds
  check_frequency = 30

  # Region: Multiple for global coverage
  regions = ["us-east", "eu-west", "ap-southeast"]

  # Alert policy
  policy_id = betteruptime_policy.critical.id

  # SSL monitoring
  ssl_expiration_threshold = 14

  # Required keyword (API returns "Healthy")
  required_keyword = "Healthy"
}

resource "betteruptime_monitor" "web_health" {
  name           = "CMS Frontend — Homepage"
  url            = "https://app.cms.example.com/"
  monitor_type   = "status"
  expected_status_code = 200
  request_timeout = 30
  check_frequency = 30
  regions = ["us-east", "eu-west", "ap-southeast"]
  policy_id = betteruptime_policy.critical.id
}

resource "betteruptime_monitor" "admin_health" {
  name           = "CMS Admin — Login"
  url            = "https://admin.cms.example.com/login"
  monitor_type   = "status"
  expected_status_code = 200
  request_timeout = 30
  check_frequency = 60
  regions = ["us-east"]
  policy_id = betteruptime_policy.warning.id
}

resource "betteruptime_monitor" "cdn_health" {
  name           = "CMS CDN — R2 Storage"
  url            = "https://cdn.cms.example.com/health-check.txt"
  monitor_type   = "status"
  expected_status_code = 200
  request_timeout = 10
  check_frequency = 60
  regions = ["us-east"]
  policy_id = betteruptime_policy.warning.id
}

resource "betteruptime_monitor" "api_latency" {
  name           = "CMS API — Latency Monitor"
  url            = "https://api.cms.example.com/health"
  monitor_type   = "latency"
  request_timeout = 30
  check_frequency = 60

  # Alert if response time > 2 seconds
  degraded_response_time = 1000
  down_response_time     = 2000

  regions = ["us-east", "eu-west"]
  policy_id = betteruptime_policy.warning.id
}

# ───────────────────────────────────────────────────────────
# 3. ALERT POLICIES
# ───────────────────────────────────────────────────────────

resource "betteruptime_policy" "critical" {
  name = "Critical — Immediate Alert"

  # Steps to escalate
  step {
    # Step 1: Immediate Slack + Email
    handler {
      type    = "slack"
      urgency = "high"
      channel = "#alerts-critical"
    }
    handler {
      type    = "email"
      urgency = "high"
      recipients = ["oncall@cms.example.com"]
    }

    # Wait 1 minute before escalating
    seconds_to_wait = 60
  }

  step {
    # Step 2: SMS after 2 minutes
    handler {
      type    = "sms"
      urgency = "high"
      recipients = ["+9665XXXXXXXX", "+9639XXXXXXXX"]
    }

    # Wait 3 minutes before final escalation
    seconds_to_wait = 180
  }

  step {
    # Step 3: Phone call after 5 minutes
    handler {
      type    = "call"
      urgency = "high"
      recipients = ["+9665XXXXXXXX"]
    }
  }

  repeat {
    times = 3
    seconds_to_wait = 300
  }
}

resource "betteruptime_policy" "warning" {
  name = "Warning — Slack only"

  step {
    handler {
      type    = "slack"
      urgency = "low"
      channel = "#alerts-info"
    }
    handler {
      type    = "email"
      urgency = "low"
      recipients = ["team@cms.example.com"]
    }
    seconds_to_wait = 0
  }
}

# ───────────────────────────────────────────────────────────
# 4. HEARTBEAT MONITORING (Process alive check)
# ───────────────────────────────────────────────────────────

resource "betteruptime_heartbeat" "api_heartbeat" {
  name    = "CMS API Heartbeat"
  period  = 60        # Expect ping every 60 seconds
  grace   = 30        # 30 second grace period
  status  = "up"
  policy_id = betteruptime_policy.critical.id
}

# Add heartbeat ping to API startup script:
# */1 * * * * curl -s https://uptime.betterstack.com/api/v1/heartbeat/{token} > /dev/null

# ───────────────────────────────────────────────────────────
# 5. STATUS PAGE (Public)
# ───────────────────────────────────────────────────────────

resource "betteruptime_status_page" "cms_public" {
  name         = "CMS Platform Status"
  subdomain    = "cms"
  custom_domain = "status.cms.example.com"
  theme        = "light"
  logo_url     = "https://cdn.cms.example.com/logo.png"

  # Show all monitors
  resource {
    monitor_id  = betteruptime_monitor.api_health.id
    public_name = "API Service"
  }

  resource {
    monitor_id  = betteruptime_monitor.web_health.id
    public_name = "Student Web App"
  }

  resource {
    monitor_id  = betteruptime_monitor.admin_health.id
    public_name = "Admin Dashboard"
  }

  resource {
    monitor_id  = betteruptime_monitor.cdn_health.id
    public_name = "CDN (R2 Storage)"
  }

  resource {
    monitor_id  = betteruptime_monitor.api_latency.id
    public_name = "API Response Time"
  }
}

# ───────────────────────────────────────────────────────────
# 6. SLACK INTEGRATION
# ───────────────────────────────────────────────────────────

# Slack channels to create:
# - #alerts-critical   → P0/P1 incidents
# - #alerts-info       → Warnings + info
# - #deployments       → CI/CD notifications
# - #incidents         → Postmortems

# Webhooks (configured via Slack app):
# - Sentry → #alerts-critical
# - Better Stack → #alerts-critical + #alerts-info
# - GitHub Actions → #deployments
# - Vercel → #deployments
# - Render → #deployments
