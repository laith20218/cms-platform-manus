# Android Shell Roadmap — Batch 0, Batch 1, Batch 2, Batch 3 & Batch 4

Hybrid WebView shell for the student experience. Kotlin stays the platform:
`apps/android` owns device security, while `apps/student-web` owns the UI it hosts.

## Locked decisions

| # | Decision |
|---|----------|
| 1 | Client stays Kotlin. No C# / no MAUI Android rewrite. |
| 2 | Hybrid architecture: a WebView shell hosts student-web; Kotlin owns device security, later cache/push. |
| 3 | `ShellActivity` (new) is the LAUNCHER for normal use. No dual login session paths in this wave. |
| 4 | `MainActivity` (current phone/password offline entry) keeps the offline package flow but loses its LAUNCHER intent-filter in Batch 1. Rename can happen later. |
| 5 | No full media cache, FCM, or Matching UI in this wave. |

## Recon snapshot (Batch 0)

- Project: `apps/android`, single module `:app`, `applicationId com.cms.student`, `versionName 0.1.0`.
- Toolchain: AGP **8.7.3**, Kotlin **2.0.21**, Gradle wrapper **8.9** (bin), JDK 17 bytecode / JDK 21 in CI, `compileSdk 35`, `targetSdk 35`, `minSdk 26`.
- Build: `cd apps/android && ./gradlew :app:assembleDebug` (needs JDK 17+ and `ANDROID_HOME` or `local.properties` `sdk.dir`). Unit tests: `./gradlew :app:testDebugUnitTest`. Instrumentation: `./gradlew :app:connectedDebugAndroidTest`.
- CI: `.github/workflows/android-offline-runtime.yml` runs `:app:assembleDebug :app:assembleDebugAndroidTest` plus API 35 connected instrumentation on every PR touching `apps/android/**`; the monorepo `ci.yml` adds a tree-wide secret scan.
- Security baseline preserved: `android:allowBackup="false"`, `android:usesCleartextTraffic="false"`, `network_security_config.xml` (cleartext denied), and the `com.cms.student.security.*` offline core with all its unit/instrumentation tests untouched.

## Build configuration keys (public config only — never secrets)

| BuildConfig key | Default | Purpose |
|---|---|---|
| `STUDENT_WEB_BASE_URL` | `https://app.cms.example.com` | HTTPS origin the shell WebView loads (Batch 1). Placeholder documented domain (see `deploy/`) until DNS go-live. |
| `API_BASE_URL` | `https://api.cms.example.com` | Consumed since Batch 2: base URL for the native login/refresh/offline clients whenever `OFFLINE_API_BASE_URL` is not injected (release pipeline). |
| `OFFLINE_API_BASE_URL` | `""` (unchanged) | Release-pipeline offline transport base; when blank the native clients fall back to `API_BASE_URL`. |
| `OFFLINE_TRUSTED_CLIENT_IMPLEMENTED` | `false` (unchanged) | Trusted offline stays disabled without release injection. |
| `OFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64` | `""` (unchanged) | Public verification key; never a private key in-repo. |
| `OFFLINE_KEYSTORE_ALIAS` | `cms.offline.package.key` (unchanged) | Android Keystore alias for the offline package key. |
| `OFFLINE_API_SPKI_PINS_BASE64` | `""` (Batch 2) | Optional SPKI SHA-256 pin set for the native clients, comma-separated, `sha256/` prefix optional. Empty = pinning off (debug friendly); non-empty = enforced fail-closed. |

Per-build override:

```bash
./gradlew :app:assembleDebug -PSTUDENT_WEB_BASE_URL=https://<student-web-host> -PAPI_BASE_URL=https://<api-host>
# Optional certificate pinning for release/ops builds:
./gradlew :app:assembleRelease -POFFLINE_API_SPKI_PINS_BASE64="sha256/AAAA...,sha256/BBBB..."
```

Both URL properties are validated at configuration time: absolute HTTPS only, no
quotes/backslashes. Pin entries are validated as base64 (with optional `sha256/`
prefix). The build fails fast on anything else, so a non-HTTPS shell URL or a
garbage pin cannot be produced by accident.

## Batch 0 — done criteria (status: DONE)

- [x] `apps/android` opens as a standard Gradle Android app; `:app:assembleDebug` green (local evidence recorded in the PR; CI re-runs it on every PR).
- [x] `STUDENT_WEB_BASE_URL` / `API_BASE_URL` BuildConfig fields added with HTTPS-only validation; all `OFFLINE_*` fields unchanged; no private keys in repo.
- [x] `android:allowBackup="false"` preserved; security core and its tests untouched.
- [x] This roadmap documents Batch 0–1 done criteria and the MainActivity launcher decision.

## Batch 1 — done criteria (status: DONE)

Delivered in `feat/android-batch-1-webview-shell`:

- [x] `shell/ShellActivity` is `MAIN`/`LAUNCHER`, sets `FLAG_SECURE`, hosts the WebView through `shell/WebViewHost`. Verified in the built APK: `MainActivity` has `exported=false` and no intent-filter; `ShellActivity` carries `exported=true` + the LAUNCHER filter.
- [x] WebView host checklist (all in `shell/WebViewHost.kt`): HTTPS-only load of `STUDENT_WEB_BASE_URL`; `shouldOverrideUrlLoading` in **both** overloads delegates to `shell/ShellUrlPolicy` which allowlists exactly the configured host (+ explicit port when the base URL carries one) and rejects non-HTTPS schemes, other hosts/subdomains, embedded credentials, and odd ports; no address bar / no external browser — blocked navigations are dropped silently; `setSavePassword(false)`; DOM storage **enabled** (student-web session storage requires it — evidence: `apps/student-web/src/app/providers/AuthProvider.tsx`, `src/services/api-client.ts` use `localStorage`/`sessionStorage`); `setAllowFileAccess(false)` + `allowContentAccess(false)` + both `*FromFileURLs` settings false; geolocation off; multiple windows off; mixed content never allowed; TLS errors fail closed (`handler.cancel()`); JS enabled; **no** `@JavascriptInterface` bridge anywhere.
- [x] `session/InstallationIdProvider` + `session/EncryptedInstallationIdStore`: stable UUID per install in `EncryptedSharedPreferences`, same file/key as the previous `CmsApplication` identity (`cms_installation_identity`/`installation_id`) so existing installs keep their id on upgrade. `CmsApplication.installationIdProvider()` exposes the read API for later `X-Installation-Id` header injection; not exposed to JS.
- [x] `MainActivity` lost its LAUNCHER intent-filter and is `exported="false"`; the offline entry stays reachable via explicit intent, e.g. `adb shell am start -n com.cms.student/.MainActivity`. The existing instrumentation suites launch it explicitly (`ActivityScenario.launch`), so they are unaffected.
- [x] Arabic-first error UI (`res/values/strings.xml` default Arabic, `values-en/` English fallback) for a missing/invalid URL (configuration error) and main-frame network/HTTP failures — honest messaging, no fake offline mode. Retry button reloads the configured home.
- [x] JVM unit tests: `ShellUrlPolicyTest` (8) + `InstallationIdProviderTest` (5) — pure logic, no Robolectric (the project does not use it). Existing security suites unchanged and green (27 total).

Notes: `android:label="CMS"` added to the application (matches the student-web PWA `short_name`); previously the launcher showed the raw package name. Out-of-scope items below remain untouched.

### Out of scope (later batches)

- Batch 5 (when Owner asks): FCM push or offline-catalog polish (the owner questionnaire
  named both as candidates; the catalog's YouTube/episode blockers below are the first
  polish targets). Batch 4 (encrypted media cache) is DONE below.
- Later: Play Integrity activation, Matching UI.

## Batch 2 — session + installation identity (status: DONE)

Delivered in `feat/android-batch-2-session-headers`:

- [x] **WebView session strategy: D1 (no token injection into the WebView).** Recon
  showed student-web keeps its tokens in `sessionStorage` (`cms-access-token` /
  `cms-refresh-token`) and injects them via its axios interceptor — there is no HttpOnly
  cookie to set, a query string would leak secrets (forbidden), and pushing tokens into
  JS would require `evaluateJavascript` (a de-facto bridge — Batch 3 scope). So the shell
  keeps loading the plain HTTPS student-web URL where the student logs in inside the
  WebView as today; the installation id stays invisible to JS. Batch 2 value = the native
  path (offline console) hardened: encrypted TokenStore + header injection + restore.
- [x] **TokenStore** (`session/TokenStore.kt`): access + refresh tokens persisted only
  after a successful login/refresh, in `EncryptedSharedPreferences` (own file
  `cms_native_session`, same security-crypto stack as the installation id). Never
  plaintext, never the password, redacted `toString` on every token-bearing model
  (`StoredNativeSession`, `OfflineSession`, `OfflineLoginResult`, `OfflineTokenPair`).
  `clear()` on logout, wrong-credentials login (401), and any offline-client 401.
- [x] **Header injection single place** (`security/OfflineRequestHeaders.kt`): every
  native request now mirrors the student-web interceptor — `X-Installation-Id` +
  `X-Device-Fingerprint` (compat; `/auth/refresh` reads the latter, most controllers
  read `X-Installation-Id ?? X-Device-Fingerprint`, and the rate limiter keys on the
  pair) and `Authorization: Bearer` on authenticated calls. Header matrix:

  | Endpoint | Authorization | X-Installation-Id | X-Device-Fingerprint | Extra |
  |---|---|---|---|---|
  | `POST /auth/login` | – | ✔ | ✔ | body: `deviceFingerprint`, `deviceName` |
  | `POST /auth/refresh` | – | ✔ | ✔ (required) | body: `refreshToken` |
  | `POST /entitlements/issue` | Bearer | ✔ | ✔ | – |
  | `POST /offline/download` | Bearer | ✔ | ✔ | `X-Entitlement`, `X-Idempotency-Key`, `X-Offline-Package-Public-Key` |
  | `POST /offline/sync` | Bearer | ✔ | ✔ | `X-Idempotency-Key` |
  | `GET /offline/packages/{id}/status` | Bearer | ✔ | ✔ | – |

- [x] **Session lifecycle** (`session/NativeSessionManager.kt` + `CmsApplication`):
  login saves tokens; process death restores them (`MainActivity` verifies the stored
  refresh token once, rotating the pair — a 401 wipes the store with an honest Arabic
  message; a transient network failure restores unverified and keeps the tokens);
  logout button + wrong-credentials login + offline-call 401 all wipe tokens;
  `HttpsOfflinePackageClient.refresh` implements `/auth/refresh`.
- [x] **API base URL wiring**: the native clients now use `OFFLINE_API_BASE_URL` when
  injected by the release pipeline, falling back to `API_BASE_URL` (HTTPS-validated in
  Batch 0) — previously the native login was unreachable in every build because
  `OFFLINE_API_BASE_URL` defaults to empty.
- [x] **Certificate pinning hook** (`security/OfflineCertificatePinning.kt`): SPKI
  SHA-256 pins via `OFFLINE_API_SPKI_PINS_BASE64`; empty (default) = off so debug
  builds against placeholder domains work, non-empty = enforced on top of normal
  system CA validation (fail-closed). Production pins are ops-supplied public hashes
  — see the command above; **pins not configured** today, so pinning is currently OFF
  by design rather than hard-failing debug builds.
- [x] **Tests (JVM)**: 53 total (27 pre-existing untouched + 26 new) — `TokenStoreTest` (3),
  `NativeSessionManagerTest` (8), `OfflineRequestHeadersTest` (5), `OfflineSessionModelsTest` (3),
  `OfflineCertificatePinningTest` (7). No Robolectric; `EncryptedSharedPreferences` stays
  covered on-device by the existing instrumentation suites.
- [x] **Non-goals respected**: no `@JavascriptInterface`, no media cache, no FCM, no Play
  Integrity activation (stub untouched), no student-web redesign, no passwords stored
  anywhere, no tokens in WebView URLs.

## Batch 3 — JS bridge (status: DONE)

Delivered in `feat/android-batch-3-js-bridge` — minimal, audited `@JavascriptInterface`
between student-web (inside the shell WebView) and Kotlin: native shell detection +
installation identity for header parity. Nothing else.

### Exact JS surface (the ONLY methods exposed to JavaScript)

```
window.CmsNative.hasNativeShell()    // -> true (false outside the allowlisted origin)
window.CmsNative.getPlatform()       // -> "android" ("" outside the allowlisted origin)
window.CmsNative.getAppVersion()     // -> versionName from PackageManager / BuildConfig ("" outside)
window.CmsNative.getInstallationId()  // -> InstallationIdProvider UUID ("" outside)
```

- **Bridge** (`bridge/CmsJsBridge.kt`, package `com.cms.student.bridge`): constructor
  takes a URL provider + the same `ShellUrlPolicy` that governs navigation. **Origin
  guard (mandatory):** EVERY method resolves the WebView's current URL and consults
  `ShellUrlPolicy.isAllowed`; when not allowlisted it returns safe defaults
  (`false` / empty string) — never throws, never partial values. Wired by
  `WebViewHost.attachJsBridge()` (`addJavascriptInterface(bridge, "CmsNative")`) which
  is called only AFTER `attach()` applied all hardening settings (password save off,
  file access off, mixed content never, multi-window off, allowlist, TLS fail-closed).
  `ShellActivity` keeps `FLAG_SECURE` ownership; no second interface exists anywhere.
- **Threat model (one paragraph).** If an XSS payload runs inside student-web, the
  bridge can leak ONLY the installation id (an opaque per-install device-binding id,
  not a credential, never a token), the platform name, and the app version. Worst
  case: device correlation or burning the per-installation rate-limit quota (the
  backend limiter keys on `X-Installation-Id ?? X-Device-Fingerprint`) — it cannot
  authenticate as anyone, cannot read the native session or token store, cannot touch
  files, cannot execute, and cannot drive navigation. Foreign iframes cannot reach real
  data either: the guard consults the main-frame URL, and `shouldOverrideUrlLoading`
  already blocks any non-allowlisted frame navigation in this single-window shell.
- **student-web (feature-detect only)**: `src/utils/native-bridge.ts` is the one typed
  accessor for `window.CmsNative` (presence check + try/catch + value sanity, so a
  malformed/hostile injection degrades to "absent"). Single injection point:
  `getOrCreateInstallationId()` now prefers the native id when present, so the
  existing axios interceptor in `src/services/api-client.ts` automatically sends
  `X-Installation-Id` + `X-Device-Fingerprint` (compat) with the NATIVE id inside the
  shell — header parity with `OfflineRequestHeaders` — while browser builds keep the
  `web-<32hex>` identity untouched. No UI changes.
- **Tests**: `CmsJsBridgeTest` (6 JVM tests) — origin allow/deny per method, non-blank
  UUID-shaped installation id when allowed, fail-closed under `allowNothing()`, and a
  reflection inventory asserting the `@JavascriptInterface` surface is EXACTLY the four
  approved methods. `src/utils/native-bridge.test.ts` (8 vitest tests) — falsy when
  `CmsNative` absent, mocked-present behavior, malformed/throwing bridge fail-closed,
  browser fallback identity preserved, native id preferred for parity.
- **Non-goals respected (enforced by absence)**: media cache, FCM, Play Integrity
  activation, certificate pin VALUES, offline catalog UI, and any token exfiltration
  API (`getAccessToken`/`getRefreshToken`/passwords) — token injection into JS remains
  D1-forbidden unless a future batch redesigns auth.

## Batch 4 — encrypted media cache (status: DONE)

Delivered in `feat/android-batch-4-encrypted-media-cache`: encrypted on-device media
cache + native in-app openers + the Arabic offline catalog «وضع بدون إنترنت» + the
origin-guarded `CmsNative` cache surface, integrated with logout/auth-reject wipe.

### Content-type matrix (Phase A recon → implementation)

| Library type | Download strategy | Native opener | Notes |
|---|---|---|---|
| PDF | `GET {API}/library/{id}/content` (Bearer + X-Entitlement + X-Installation-Id + X-Device-Fingerprint) | `media/PdfViewActivity` — framework `PdfRenderer`, page list, LRU bitmap cache | MERGE-CRITICAL path, implemented |
| TXT + HTML (text) | same `/content` endpoint | `media/TextReaderActivity` — TextView column (txt) / hardened WebView, JS off (html) | Interactive lessons (enableScripts) render static — documented degradation |
| Audio | same `/content` endpoint (full object) | `media/AudioPlayerActivity` — MediaPlayer + seekbar | |
| Video (non-YouTube) | same `/content` endpoint (full object) | `media/VideoPlayerActivity` — VideoView + MediaController | Presigned/HLS playback-url paths deliberately unused (external host / multi-object ladder) |
| Image | same `/content` endpoint | `media/ImageViewerActivity` — bounded decode + zoom | |
| Video (YouTube rows) | **BLOCKED** — YouTube-hosted; no API bytes exist | web iframe path unchanged | student-web skips ensureLocal for `youtubeVideoId` rows |
| course-episode audio/video | **BLOCKED** — only presigned object-storage playback URLs (host not allowlistable) or multi-object HLS ladders; no same-origin full-object endpoint | web streaming unchanged | documented for a future batch |

Native URL derivation: the cache derives `{OFFLINE_API_BASE_URL ?? API_BASE_URL}/library/{contentId}/content`
itself from the validated UUID — a JS-supplied URL is never fetched (no arbitrary-URL
surface). `POST /entitlements/issue` (same headers, in-process cached with 60s renewal
skew) supplies the `X-Entitlement` token the controller gate requires.

### Honest session requirement (D1 carried forward)

Downloads need a native session (TokenStore access token — the WebView's
sessionStorage Bearer tokens are deliberately unreachable per strategy D1, and there
is no cookie to capture). `ensureLocal` answers `denied_native_session` when absent;
the offline catalog surfaces a one-tap local sign-in entry (`MainActivity`, same
`/auth/login` endpoint + credentials the student already uses in the WebView).
A dead access token triggers ONE rotation via `/auth/refresh` before denying.

### Storage + policy

- **Encrypt-at-rest**: AndroidX `EncryptedFile` + Android Keystore `MasterKey`
  (AES256_GCM_HKDF_4KB — the Batch-2 token-store stack) for every object AND the index
  document; atomic tmp-then-rename writes; app-private `filesDir/media-cache` (G6:
  no plaintext media at rest; openers decrypt transiently into an app-private temp
  file deleted on viewer close).
- **Quota**: `CachePolicy.MAX_CACHE_BYTES` = 1 GiB; LRU eviction (by `lastAccessAt`)
  on insert, never evicting in-flight/open ids; an un-trimmable plan refuses the
  download (`quota`).
- **Offline window**: `CachePolicy.CONFIRMATION_WINDOW_HOURS` = 72 — offline opens
  require `lastConfirmedAt` within 72h; stale objects answer `denied_stale`. While
  online, `openLocal` re-checks entitlement with a bounded (2.5s) HEAD through the
  same authorized+entitlement headers (owner lock 9).
- **Wipe integration**: `NativeSessionManager.onTokensCleared` (fires on logout,
  auth rejection, refresh-401) wipes every encrypted media file + index synchronously
  (owner lock 3).

### Exact JS surface (the ONLY methods exposed to JavaScript — 4 + 7)

```
window.CmsNative.hasNativeShell()    // -> true (false outside the allowlisted origin)
window.CmsNative.getPlatform()       // -> "android" ("" outside)
window.CmsNative.getAppVersion()     // -> versionName ("" outside)
window.CmsNative.getInstallationId() // -> UUID ("" outside)
window.CmsNative.listCached()        // -> JSON rows: contentId/type/title/bytes/createdAt/lastAccessAt
window.CmsNative.ensureLocal(id, type, hints) // -> started|ready|downloading|denied_*|quota|error codes
window.CmsNative.openLocal(id)       // -> opened|missing|denied_stale|denied_auth|denied_native_session
window.CmsNative.cacheStatus(id)     // -> queued|downloading:<pct>|ready|denied_auth|error:<code>|absent
window.CmsNative.cancelDownload(id)  // -> canceled|not_downloading|absent
window.CmsNative.removeCached(id)    // -> removed|absent
window.CmsNative.clearCache()        // -> cleared
```

Origin guard (mandatory, unchanged): EVERY method consults the same
`ShellUrlPolicy` allowlist per call; not allowlisted → safe defaults
(`""`/`false`/`"[]"`/`denied_origin`/`absent`), never throws. Outside the origin the
action methods (ensureLocal/openLocal/clearCache) answer `denied_origin` and reach
NO cache logic. Forbidden and absent: token accessors, raw filesystem paths (the
index's `storedFileName`/`sourcePath` never cross the bridge), arbitrary URL fetch,
eval, external-viewer/file-share intents.

**Threat model update (XSS in student-web):** the readable surface grows only by
cache metadata (ids, types, Arabic titles, byte counts, timestamps) — no content
bytes, no paths, no source URLs, no tokens. The action surface can fill the cache with
content the student is already entitled to (the server re-validates the student's own
native session + signed entitlement per request), burn the per-installation
rate-limit quota, or delete cached rows — a nuisance, never an escalation: it cannot
authenticate as anyone else, cannot reach another student's content, cannot exfiltrate
a token, cannot execute strings, cannot drive navigation, and cannot open anything
beyond ids already in the cache.

### student-web (feature-detect only)

- `src/utils/native-cache.ts` (new) — the one typed accessor for the cache surface:
presence + method-shape checks, try/catch, value sanity; deny-code → Arabic message
map; the download-wait poll loop. `DocumentViewer` gained a small hook: inside the
shell, the first open of a cacheable library file routes `ensureLocal` → progress
interstitial → `openLocal` (owner lock 7); in the browser the hook stays inactive and
every existing rendering branch is untouched. YouTube rows and `other` kinds skip
native routing.

### Tests

- Android JVM: `CacheQuotaTest` (6), `CacheIndexTest` (6), `MediaCacheServiceTest` (26),
  `CmsJsBridgeTest` (9 — now asserting the 11-method inventory + cache origin deny),
  `NativeSessionManagerTest` (12 — 4 new wipe-hook tests).
- student-web vitest: `native-cache.test.ts` (14) — inactive in browser, Batch-3-only
  shell degrades, throwing bridge fails closed, kind mapping incl. YouTube refusal,
  hints JSON, deny-message map, wait-loop outcomes (fake timers).

## Batch 5 — next (ONLY when Owner asks)

Not started. Candidates from the owner questionnaire: FCM push notifications, or
catalog polish (YouTube/episode offline blockers above, catalog bulk actions,
background refresh of stale entries).
