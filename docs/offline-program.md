# Offline Program — سياسة العمل دون اتصال (Owner decisions 2026-11-23)

State: **implemented on main** (PRs #182–#186). This document is the single
pointer for the offline policy: what changed, the exact constants, how to enable
question packages for a release, the admin entry points, the manual acceptance
test, and the residual risks. Historical background: `android-shell-roadmap.md`
(Batches 0–4) and `CMS-Android-Content-Session-Protection-Report.md` (a dated
snapshot — some of its numbers are superseded here).

## 1. The six locked owner decisions (as implemented)

| # | Decision | Where it lives now |
|---|---|---|
| 1 | Offline **question packages** enabled via a real release pipeline; fail closed when misconfigured | `apps/android/app/build.gradle.kts` (gradle `GradleException` on incomplete combos) + `CmsApplication.offlineEnabled = BuildConfig.OFFLINE_TRUSTED_CLIENT_IMPLEMENTED` + `security/AndroidOfflineBuildConfiguration.kt` (runtime backstop) |
| 2 | After first successful online acquisition/open, offline open/interact until the **server-issued expiry** embedded with the package | `security/OfflineRuntimeCoordinator.continueOffline` (manifest `expiresAt`; the 15-minute post-confirmation window is retired) |
| 3 | Media library cache quota = **5 GiB** | `media/CachePolicy.MAX_CACHE_BYTES = 5_368_709_120`; mirrored display-only in `apps/student-web/src/utils/native-cache.ts` (`NATIVE_MEDIA_CACHE_MAX_BYTES`) |
| 4 | Media cache must NOT deny solely because N hours passed — durable local ciphertext until logout wipe / 401 session-end / entitlement expired-or-revoked (online re-check; offline honors stored expiry metadata, never fake infinite rights) | `media/CachePolicy.kt` header, `MediaCacheService.isOfflineUsable`, `MediaCacheEntry.entitlementExpiresAt` (persisted in the encrypted `index.json`) |
| 5 | Arabic honesty: YouTube videos / course episodes are NOT offline-cacheable | `native-cache.ts` `nativeCacheTypeFor` exclusion + `UNCACHEABLE_OFFLINE_NOTE` rendered in the offline panel |
| 6 | Modern admin UI for offline package/status/revocation | `AdminOfflineController` (lifecycle-only, SuperAdmin) + admin-web «الحزم دون اتصال» (`OfflineCenter.tsx`) |
| 7 | D1 unchanged; no passwords stored; no IMEI; no DRM | unchanged (bridge surface untouched; identity stays a random per-install UUID) |

## 2. Exact constants (after the program)

| Constant | Value | File |
|---|---|---|
| `CachePolicy.MAX_CACHE_BYTES` | 5_368_709_120 (5 GiB) | `media/CachePolicy.kt` |
| Media offline gate | **none by time** — only `entitlementExpiresAt` (nullable) per entry | `MediaCacheService.isOfflineUsable` |
| `denied_stale` meaning | stored server-issued entitlement expiry has passed | `CachePolicy.kt` |
| Package offline bound | `manifest.expiresAt` (server sets `downloadedAt.AddDays(7)`) | `OfflineRuntimeCoordinator.continueOffline`; server `OfflineHandlers.cs:103` |
| Package first-open requirement | stored `lastConfirmedStatus == ACTIVE` from the first successful online acquisition/open | `OfflineRuntimeCoordinator.kt` |
| Server feature flags | `Features:OfflineEnabled` + `OfflineAesGcmImplemented` + `OfflineManifestImplemented` + `OfflineKeyReleaseImplemented` + `OfflinePackageIssuanceImplemented` (+`OfflineTrustedClientImplemented`) | `OfflineHandlers.cs:49-71` |
| `offline-package` rate limit | 5 requests / 15 min (per IP+installation) | `Program.cs` |
| Admin endpoints | `GET /api/v1/admin/offline/packages`, `GET …/{id}`, `POST …/{id}/revoke` — `[Authorize(Policy = "SuperAdmin")]` | `AdminOfflineController.cs` |

## 3. Enablement checklist (release pipeline)

**Server (API appsettings / environment):**
1. `Features:OfflineEnabled=true`, `Features:OfflineAesGcmImplemented=true`, `Features:OfflineManifestImplemented=true`, `Features:OfflineKeyReleaseImplemented=true`, `Features:OfflinePackageIssuanceImplemented=true`.
2. Provide the manifest signing key pair to the package service (see `ANDROID_OFFLINE_KEY_CONFIGURATION.md`). Only the PUBLIC SPKI goes to the APK.
3. Optional: `Features:OfflineTrustedClientImplemented=true` to force device-key binding at issuance.

**Android release build (fail closed):**
```bash
./gradlew :app:assembleRelease \
  -POFFLINE_TRUSTED_CLIENT_IMPLEMENTED=true \
  -POFFLINE_API_BASE_URL=https://<api-host> \
  -POFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64=<base64 SPKI of the signing PUBLIC key> \
  -POFFLINE_KEYSTORE_ALIAS=cms.offline.package.key
```
- Any missing value → `GradleException` ("failing closed"); HTTPS enforced; keys/URLs come from `-P` flags, CI variables, or a gitignored gradle properties file. No private key ever enters the repo or the APK.
- Certificate pins: store/release builds pass `-POFFLINE_API_SPKI_PINS_MANDATORY=true -POFFLINE_API_SPKI_PINS_BASE64=sha256/...,sha256/...` (fail-closed on an empty set; debug stays pin-optional) — D-PIN **closed** 2026-11-24, see `docs/security/CERTIFICATE-PINNING.md` for extraction, CI usage, and the rotation-overlap procedure.
- Without the flag the build is identical to the historical Batch-4 build: packages disabled, media cache fully functional.

**Verification of fail-closed:** run the command above minus any one value — the build must refuse. Runtime backstop: `AndroidOfflineBuildConfiguration.trustConfiguration` throws on enabled-but-incomplete (unit-tested).

## 4. Admin entry points

- Admin web → **القياس والتدقيق** group → **«الحزم دون اتصال»** (super-admin only): lifecycle table (status badges نشطة/ملغاة/منتهية الصلاحية), student filter, **confirm-gated revoke**. Revocation semantics under decision 2: the package stops at the device's **next online contact** (`openOnline`/`sync` force a fresh status check and invalidate the local envelope) — an already-airplane-mode device may keep working until then; this is the documented, accepted tradeoff of expiry-bound offline rights.
- Audit: every admin revoke writes `SecurityAudit` (`OfflinePackageRevoked`, Warning, admin actor).

## 5. Manual acceptance test (online → airplane → expiry)

1. Install an enabled release build; log in from the app console (`MainActivity` shows the **ready** message `offline_ready`).
2. Online: download a package for a subject; open it once (`openOnline`) — confirmation stored ACTIVE.
3. Airplane mode: `continueOffline` opens questions, answers captured locally, sync deferred — **at any later time before expiry** (no 15-minute limit).
4. Media cache: open library files → auto-saved to the encrypted cache; panel meter shows used/5 GiB; airplane mode opens all cached files regardless of age (unless their stored entitlement expiry passed → `denied_stale` with the Arabic reconnect message).
5. Online again: sync answers (revocation pre-check), verify admin center lists the package ACTIVE; revoke it from the admin center; airplane again → `openOnline`/`sync` refused; `continueOffline` also refuses (envelope invalidated on the last online contact).
6. Let a package pass `expiresAt` (or lower it server-side) → offline open refused even though the last confirmation was recent — proves the expiry bound.
7. Logout / wrong-password 401: the whole media cache wipes synchronously.

## 6. Residual risks (honest)

- **Temp decrypt-for-view**: PDF/video/audio openers decrypt into an app-private temp file deleted in `onDestroy`; a force-kill mid-view may leave the temp file until the OS clears the cache dir. FLAG_SECURE blocks screenshots/recents only — **it is not DRM** and makes no promise against recording, root, or an external camera (DEBT `D-ABSURD`).
- **Revocation latency** under expiry-bound offline rights: revocation takes effect at the next online contact (accepted; see §4).
- **Pinning is mandatory-capable but off by default**: the repo default keeps pins optional for debug/dev; store/release pipelines must build with `OFFLINE_API_SPKI_PINS_MANDATORY=true` (fail-closed) — D-PIN **closed** 2026-11-24, residual: a release pipeline that forgets the mandatory flag ships system-trust-only (pipeline discipline). Play Integrity is still a stub (`NOT_CONFIGURED`).
- WebView DOM-storage tokens are not file-encrypted (DEBT `D-JS-AUTH`).
- The server never learns which library files a device has cached (downloads are stateless + audited); the ledger exists for question packages only.

## 7. Debt register

See `docs/security/OFFLINE-DEBT-REGISTER.md` — `D-PIN`, `D-JS-AUTH`, `D-ABSURD`, all OPEN, deliberately out of scope for this program.
