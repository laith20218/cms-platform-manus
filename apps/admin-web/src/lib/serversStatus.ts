/**
 * PR-9 — Servers Dashboard status vocabulary (lib helper).
 *
 * The ONLY health vocabulary the dashboard consumes (mirrors
 * CMS.Application/DTOs/Monitoring/MonitoringDtos.cs):
 *   provider  — operational | degraded | down | unavailable |
 *               missing_credentials | invalid_credentials | rate_limited
 *   overall   — healthy | degraded | down | unavailable | unknown
 *
 * Every wire value maps to a bilingual label (dictionary keys) + a tone, and
 * every non-operational value carries a bilingual explanation of what it
 * MEANS — a badge is never color-only, and an unknown value falls back to an
 * explicit localized «unknown» instead of leaking the raw enum into an Arabic
 * surface.
 *
 * `unavailableReason` / history `reason` strings arrive from the BACKEND
 * (often Arabic) and are rendered verbatim by the component — this module
 * never invents a reason.
 */
import { t, type Locale } from './dictionary';

/**
 * CONSERVATIVE POLLING INTERVAL — exactly 5 minutes (300,000 ms).
 *
 * Interval choice (documented): the backend caches each provider check for 60
 * seconds and the providers rate-limit strictly; a 5-minute dashboard tick
 * (1 request per provider per tick) stays far inside every provider quota
 * while keeping the panel reasonably current. Polling pauses while the tab is
 * hidden (document.visibilitychange) and the first load is immediate.
 */
export const SERVERS_POLL_INTERVAL_MS = 300_000;

/** Visual tone families for the status badges (never color-only — text always rides along). */
export type ServersTone = 'ok' | 'warn' | 'error' | 'neutral' | 'config' | 'unknown';

const TONE_CLASSES: Record<ServersTone, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-300',
  warn: 'text-amber-700 bg-amber-50 border-amber-300',
  error: 'text-red-700 bg-red-50 border-red-300',
  neutral: 'text-slate-600 bg-slate-100 border-slate-300',
  config: 'text-orange-700 bg-orange-50 border-orange-300',
  // a11y: slate-500 on slate-100 measured 4.34:1 (< 4.5:1) — slate-600 reaches ~6.9:1.
  unknown: 'text-slate-600 bg-slate-100 border-slate-300',
};

/** Tailwind badge classes for a tone (label text is rendered beside it — never color alone). */
export function serversToneClasses(tone: ServersTone): string {
  return TONE_CLASSES[tone];
}

const PROVIDER_STATUS_LABEL_KEYS: Record<string, string> = {
  operational: 'servers.status.operational',
  degraded: 'servers.status.degraded',
  down: 'servers.status.down',
  unavailable: 'servers.status.unavailable',
  missing_credentials: 'servers.status.missingCredentials',
  invalid_credentials: 'servers.status.invalidCredentials',
  rate_limited: 'servers.status.rateLimited',
};

const PROVIDER_STATUS_EXPLANATION_KEYS: Record<string, string> = {
  operational: 'servers.statusExplanation.operational',
  degraded: 'servers.statusExplanation.degraded',
  down: 'servers.statusExplanation.down',
  unavailable: 'servers.statusExplanation.unavailable',
  missing_credentials: 'servers.statusExplanation.missingCredentials',
  invalid_credentials: 'servers.statusExplanation.invalidCredentials',
  rate_limited: 'servers.statusExplanation.rateLimited',
};

/** Bilingual label for one provider status wire value (unknown → explicit «unknown»). */
export function providerStatusLabel(locale: Locale, status: string): string {
  const key = PROVIDER_STATUS_LABEL_KEYS[status];
  return key ? t(locale, key) : t(locale, 'servers.status.unknown');
}

/** Bilingual «what this status means» sentence for a provider status value. */
export function providerStatusExplanation(locale: Locale, status: string): string {
  const key = PROVIDER_STATUS_EXPLANATION_KEYS[status];
  return key ? t(locale, key) : t(locale, 'servers.statusExplanation.unknown');
}

/** Visual tone for a provider status wire value. */
export function providerStatusTone(status: string): ServersTone {
  switch (status) {
    case 'operational':
      return 'ok';
    case 'degraded':
    case 'rate_limited':
      return 'warn';
    case 'down':
    case 'invalid_credentials':
      return 'error';
    case 'unavailable':
      return 'neutral';
    case 'missing_credentials':
      return 'config';
    default:
      return 'unknown';
  }
}

const OVERALL_STATUS_LABEL_KEYS: Record<string, string> = {
  healthy: 'servers.overall.healthy',
  degraded: 'servers.overall.degraded',
  down: 'servers.overall.down',
  unavailable: 'servers.overall.unavailable',
  unknown: 'servers.overall.unknown',
};

/** Bilingual label for the summary overallStatus wire value. */
export function overallStatusLabel(locale: Locale, status: string): string {
  const key = OVERALL_STATUS_LABEL_KEYS[status];
  return key ? t(locale, key) : t(locale, 'servers.overall.unknown');
}

/** Visual tone for the summary overallStatus wire value. */
export function overallStatusTone(status: string): ServersTone {
  switch (status) {
    case 'healthy':
      return 'ok';
    case 'degraded':
      return 'warn';
    case 'down':
      return 'error';
    case 'unavailable':
      return 'neutral';
    default:
      return 'unknown';
  }
}

/**
 * Honest response-time rendering: -1 (or any negative / non-number) means NO
 * upstream call was attempted — «غير متاح», never an invented number.
 * Real values are locale-formatted («٦٨٠ ملّي» / "680 ms") — the Arabic
 * numbering system is requested explicitly (ar-u-nu-arab) because modern ICU
 * defaults render 'ar' with Western digits.
 */
export function responseTimeLabel(locale: Locale, responseTimeMs: number | null | undefined): string {
  if (typeof responseTimeMs !== 'number' || responseTimeMs < 0) {
    return t(locale, 'servers.responseTimeUnavailable');
  }
  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-arab' : 'en').format(responseTimeMs);
  return t(locale, 'servers.responseTime', { ms: formatted });
}
