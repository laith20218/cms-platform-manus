# Phase P Containment Audit — تدقيق الاحتواء للمرحلة P

Phase P (offline containment) closure audit, 2026-11-25, branch
`feat/offline-containment-phase-p` (stacked on `feat/offline-exam-webview-2a`).
Subject: **wipe-on-logout / wipe-on-401 across every offline store** — the
containment gaps found by the recon were (1) a WEB logout inside the Android
shell wiped nothing native (the web session is a separate session graph, D1),
(2) a NATIVE session death wiped the media cache only — not the question-package
envelopes nor the W2/W3 bridge-service runtime state, and (3) no Phase P audit
existed. This document is item (3); items (1) and (2) are closed by the Phase P
code (commits `f641f2e`, `816d62e`, `0a34694` on the same branch).

Verification at audit time: Android `:app:testDebugUnitTest` 23 suites / 194
tests / 0 failures; student-web vitest 81 files / 831 tests; `tsc --noEmit`
clean; eslint (max-warnings=0) clean.

---

## 1. Scope table — every offline store and path

One row per store; every cell is filled from the code, with the file that
proves it. "Native" = a session held by the app itself
(`CmsApplication.activeSession` / stored token pair); "web" = the student-web
session inside the shell WebView (DOM storage).

| Store | App-private location | Encrypted at rest | FLAG_SECURE viewer | External-intent exposure | Bridge bytes/paths exposure | Wipe on logout (native) | Wipe on logout (web) | Wipe on 401 | Residual notes |
|---|---|---|---|---|---|---|---|---|---|
| (a) Library media cache (files + index) | `filesDir/media-cache` — `<contentId>.bin` objects + `index.json` (`apps/android/.../media/EncryptedMediaCacheStore.kt`) | Yes — AndroidX `EncryptedFile` + Android Keystore `MasterKey`, AES256_GCM_HKDF_4KB (same file) | Yes — every viewer descends `MediaViewerActivity` (sets `FLAG_SECURE`); shell + catalog too | None — `NativeMediaOpener` starts in-app `exported="false"` activities only (owner lock 5; `AndroidManifest.xml`); no FileProvider, no share intents | Rows only: contentId/kind/title/bytes/timestamps — no paths, no source URLs (`CacheIndex.toSafeJson`, `CmsJsBridge` threat model) | **Yes** — `NativeSessionManager.onLoggedOut → onTokensCleared → mediaCacheService.wipe()` (`CmsApplication` session graph, pre-existing Batch 4) | **Partial (Phase P)** — no native session → full wipe via the `onFullWipe` seam; a LIVE native session → not wiped (rows are installation-scoped, not user-tagged — honest limitation, §2) | **Yes** — every native 401 funnel (`loginStudent` 401, `restore` refresh-401, media-path `onAuthDead`) reaches `onNativeAuthRejected` → wipe; web 401 verdict → `clearSession()` → `notifyWebSessionEnded()` → same partial policy | Temp decrypt-for-view files exist during viewing (deleted in viewer `onDestroy`, app-cache-dir scoped); not user-tagged (§2) |
| (b) Question-package envelopes (W2) | `filesDir/offline-envelopes` — `<packageId>.bin` records + transient `.bin.tmp` writes (`apps/android/.../security/EncryptedOfflinePackageStore.kt`) | Yes — the same `EncryptedFile`/`MasterKey` stack (`EncryptedOfflinePackageStore.kt`) | Yes — the player runs in `OfflineExamWebActivity` (and the native `OfflineExamActivity`), both FLAG_SECURE | None — `exported="false"`, `noHistory`; package bytes never leave the app via intents | Rows only: packageId/subjectIds/status/expiresAt/counts — no paths, no tokens, no key material (`OfflinePackageBridgeService.rowJson`, asserted in tests) | **Yes (Phase P)** — `clearAuthenticatedStudent()/onNativeAuthRejected() → offlinePackageStore.wipeAll()` + `offlinePackageBridgeService.reset()` (`CmsApplication`) | **Yes (Phase P)** — full `wipeAll()` when no native session survives; selective invalidation of the WEB user's packages when one does (§2) | **Yes (Phase P)** — same two funnels as (a) | The full wipe destroys unsynced local answers with their envelopes (containment over preservation — by design); the real store has no JVM test (AndroidX EncryptedFile is device-bound — policy is JVM-tested with fakes, store exercised by the instrumentation suite) |
| (c) W2/W3 bridge runtime state (download states, package-id map, `lastWebStudentId`) | Process memory only — `OfflinePackageBridgeService.states`/`packageIdToKey`/`lastWebStudentId` + the `CmsApplication.lastWebStudentId` mirror; never persisted (`apps/android/.../bridge/OfflinePackageBridgeService.kt`) | N/A — memory-only, process lifetime | N/A | N/A | Stable status codes only (`queued`/`downloading`/`ready`/…); rows never carry paths or tokens | **Yes (Phase P)** — `reset()` from both native session-death paths (`CmsApplication`) | **Yes (Phase P)** — `onWebSessionEnded()` resets state + binding in BOTH policy branches (§2) | **Yes (Phase P)** — same funnels | Process death forgets `lastWebStudentId` by design; the next web-token download re-binds it |
| (d) WebView DOM storage (the web session itself) | The WebView profile inside the app's private data dir (`app_webview/…`) — `sessionStorage` + `localStorage` rows written by `apps/student-web/src/services/session-store.ts` | **Partial** — durable token rows sealed `v1:` (AndroidKeyStore AES-GCM via `CmsNative.sealForLocalPersistence`, D-JS-AUTH); the tab-scoped `sessionStorage` mirror stays RAW by design; the `/me` profile-cache row is plaintext JSON (public profile, no credentials) | Yes — the shell WebView runs inside FLAG_SECURE `ShellActivity` (exam webview inside `OfflineExamWebActivity`) | None — file/content access off, navigation allowlisted, multi-window off (`shell/WebViewHost.attach`) | D1 — the bridge never returns the web session tokens; the seal pair only accepts page-owned blobs | **No direct wipe** — the web session is a separate session graph (D1); it dies at its NEXT server verdict (401 → `clearSession()`) or the student's own web logout. Honest residual, §4 | **Yes** — `clearSession()` wipes BOTH stores + the «تذكّرني» flag + the profile cache (`session-store.ts`) | **Yes** — the api-client verdict (`isSessionEndingFailure → clearSession()`, `services/api-client.ts`); Phase P chains the native notify right after it | A native logout leaves the web DOM rows until the web session's own death; `sessionStorage` token mirror is raw by design (dies with the tab) |
| (e) Remember-me seal (D-JS-AUTH) | AES-256-GCM key in the Android Keystore (never exportable) + sealed `v1:` blobs inside the WebView `localStorage` token rows (`apps/android/.../session/TokenSeal.kt`, `KeystoreTokenSeal`) | Yes — `v1:<base64(iv‖ciphertext+tag)>` envelope, key never leaves the keystore | N/A — ciphertext only, no viewer | None | Seal/unseal accept page-owned blobs; never key material, never token getters | N/A — the key is install-scoped and survives logouts BY DESIGN; the sealed VALUES die with the DOM rows (row (d)) | **Yes** — `clearSession()` removes the sealed token rows (`session-store.ts`) | **Yes** — same choke point | Seal protects at rest only; code running in the page always holds the live session (standing D-JS-AUTH note, `PROTECTION-LIMITS.md`) |

---

## 2. The Phase P web-session-end wipe policy

`OfflinePackageBridgeService.onWebSessionEnded()` (reached from JS as bridge
method #19 `notifyWebSessionEnded()`, origin-guarded in `CmsJsBridge`, fired
best-effort by student-web's `clearSession()` choke point):

1. **No live native session** (`sessionProvider() == null`) → **FULL wipe**:
   `packageStore.wipeAll()` (every `.bin` + `.tmp` in
   `filesDir/offline-envelopes`), every download state + package-id map
   dropped, `lastWebStudentId = null`, and the `onFullWipe` seam fires —
   `CmsApplication` wires it to `mediaCacheService.wipe()`, so the media cache
   goes in the same instant. Answers `"wiped"`. A logout with nothing bound is
   still a full (no-op) wipe — containment never depends on prior state.
2. **Live native session** → the web user's OWN packages still go: when
   `lastWebStudentId` is set and differs from the native student, every package
   bound to the web student is selectively invalidated; the runtime state,
   package-id map, and web binding are always reset (the binding is gone by
   definition). The native user's records stay — the NATIVE logout owns their
   wipe. The media-cache hook is NOT fired. Answers `"kept_native_session"`.

Native session death (logout / auth rejection) is symmetric and total:
`CmsApplication.clearAuthenticatedStudent()` / `onNativeAuthRejected()` wipe the
media cache (pre-existing hook), the package envelopes (`wipeAll()`), the
bridge runtime state (`reset()`), and `lastWebStudentId`.

**Honest limitations of this policy:**

- **The media cache is installation-scoped, not user-tagged.** With a live
  native session a web-session end CANNOT selectively wipe media — that native
  user's cached media persists until the native session itself dies (its own
  wipe hook covers the whole cache then). With no native session the full wipe
  covers it.
- **Version skew:** `notifyWebSessionEnded` is optional on the bridge; a
  pre-Phase-P APK paired with this web build is an honest no-op (the wrapper
  returns null and logout proceeds). Containment then waits for the native
  paths.
- **No data flows web→native** on the notification — the page signals ITS
  session ended; the only direction of effect is native data destruction. A
  non-allowlisted origin cannot even trigger that (the origin guard answers
  `denied_origin` without touching the seam — locked by test).

---

## 3. Enforcement test inventory

| Property | Locked by |
|---|---|
| Bridge surface is exactly 19 methods (incl. `notifyWebSessionEnded`); no token getters ever | `apps/android/.../bridge/CmsJsBridgeTest.kt` — `the js surface is exactly the nineteen approved methods` + forbidden-name assertions |
| `notifyWebSessionEnded` is origin-guarded; a foreign page cannot trigger a wipe; a throwing seam degrades to `error` | `CmsJsBridgeTest` — `every method returns safe defaults…`, `origin guard fails closed with a blocking policy…`, the two Phase P delegation/degradation tests |
| Full wipe on web-session end with no native session (wipeAll counted, `onFullWipe` fired, states + binding reset) | `OfflinePackageBridgeServiceTest` — `web session end with no native session wipes the store and fires the full-wipe hook` |
| Logout with nothing bound is still a full wipe (no-op wipe, never a skip) | `OfflinePackageBridgeServiceTest` — `web session end with no native session and nothing bound still runs the full wipe` |
| Selective wipe: the web user's packages invalidated, the native user's untouched, media hook NOT fired | `OfflinePackageBridgeServiceTest` — `web session end with a live native session wipes only the web user's packages` |
| Binding == native student → `kept_native_session`, zero invalidations | `OfflinePackageBridgeServiceTest` — `web session end with the binding matching the native student keeps the packages` |
| `reset()` clears runtime state with ZERO store writes (wipe ownership stays with the application graph) | `OfflinePackageBridgeServiceTest` — `reset clears the runtime state without any store writes`; `OfflineExamSessionRunnerTest` FakeStore `wipeAllCalls` stays 0 (the runner never wipes) |
| `clearSession()` fires the notify exactly once per call, never throws, no-ops without the bridge; both stores + flag wiped | `apps/student-web/src/test/offline-wipe-phase-p.test.ts` (5 cases; the 401-verdict path is covered through the same choke point the api-client interceptor calls — documented in the suite header) |
| Feature-detect, code passthrough, trim, fail-closed null for the new wrapper | `apps/student-web/src/utils/native-bridge.test.ts` — `native web-session-end notification (Phase P)` |
| Pre-existing web-session wipe (both stores + flag) regression | `src/test/remember-me.test.tsx`, `src/test/remember-me-token-seal.test.ts` |

---

## 4. Explicit residual list (standing, honest)

1. **Temp decrypt-for-view files** (existing, D-ABSURD closure): PDF/video/audio
   viewers decrypt into app-cache-dir temp files and delete them in `onDestroy`
   (`PdfViewActivity`/`VideoPlayerActivity`/`AudioPlayerActivity`); a hard
   crash can leave one behind until the OS clears the cache dir. App-private
   either way.
2. **Revocation latency offline** (existing): a server-side revocation is only
   observed at the next online status refresh; the offline window persists
   until then.
3. **SPA network load for the exam webview cold start** (W3 residual): the
   `/offline-exam/:packageId` player loads from `STUDENT_WEB_BASE_URL` over the
   network; a fully offline cold start shows the honest shell-style network
   error (answers captured after load stay offline in the encrypted store).
4. **Emulator CI red** (pre-existing): the connected/instrumentation lane does
   not run in this environment; JVM + vitest lanes are the enforced gates.
5. **PlayIntegrity stub**: `PlayIntegrityHelper` exists but integrity verdicts
   are not enforced in this program (see `PROTECTION-LIMITS.md`).
6. **Pinning off-by-default** (D-PIN residual): `OFFLINE_API_SPKI_PINS_MANDATORY`
   defaults OFF in the repo; release pipelines must opt in (fail-closed gradle
   gate + runtime backstop back them up).
7. **Media cache is installation-scoped, not user-tagged** (Phase P, §2): with a
   live native session a web-session end cannot selectively wipe media — the
   native user's cache persists until the native session dies.
8. **Older shells are a no-op** (Phase P, §2): `notifyWebSessionEnded` does not
   exist on pre-Phase-P APKs; web-side logout then wipes only the web session
   and containment waits for a native path.
9. **A native logout does not directly wipe the WebView DOM storage** (D1: the
   web session is a separate session graph): the web rows die at the web
   session's own death — the next server 401 verdict (`clearSession()`, which
   NOW also chains the native wipe) or the student's own web logout.
10. **An exam-answer sync 401 does not itself wipe the package store**: the
    coordinator maps it to the honest `AUTH_REJECTED` disposition
    (`OfflineRuntimeCoordinator.sync`); the wipe fires when session death
    reaches a wired funnel (native logout/auth-death, web logout/verdict). The
    answers stay encrypted locally until then.
