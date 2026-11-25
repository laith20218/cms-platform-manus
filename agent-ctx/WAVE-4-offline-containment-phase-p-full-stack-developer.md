# WAVE-4 — Phase P Containment (wipe-on-logout / wipe-on-401 across ALL offline stores)

Task ID: WAVE-4 (branch `feat/offline-containment-phase-p`, base
`feat/offline-exam-webview-2a` @ 5a4cb6d, stacked — no rebase, no push, no PR,
apps/api UNTOUCHED — verified empty `git diff 5a4cb6d..HEAD -- apps/api`).
Status: DONE — Android `:app:testDebugUnitTest` 23 suites / 194 tests / 0
failures; student-web vitest 81 files / 831 tests (822 pre-existing + 9 new);
`tsc --noEmit` clean; eslint (max-warnings=0) clean.

## Mission recap

The recon found three containment gaps: (1) a WEB logout inside the shell wiped
NOTHING native (web session graph is separate, D1); (2) a NATIVE auth-death
(`CmsApplication.onNativeAuthRejected`) wiped the MEDIA cache only — not the
question-package envelopes nor the W2/W3 bridge-service runtime state; (3) no
Phase P audit document. WAVE-4 closes all three.

## Commits (4, one per deliverable)

1. `f641f2e` feat(offline): W4 D1 — Phase P wipe machinery (store wipeAll + onWebSessionEnded + bridge #19)
   - apps/android: OfflinePackageModels.kt (IOfflinePackageStore.wipeAll()),
     EncryptedOfflinePackageStore.kt (wipeAll impl: every .bin + .tmp in
     filesDir/offline-envelopes, per-file runCatching, never throws),
     OfflinePackageBridgeService.kt (onWebSessionEnded() policy + reset() +
     onFullWipe seam + WIPED/KEPT_NATIVE_SESSION constants + honest KDoc),
     bridge/WebSessionEndApi.kt (NEW fun interface), CmsJsBridge.kt (method
     #19 notifyWebSessionEnded, origin-guarded, guarded() fallback "error",
     class doc surface 19 + threat-model paragraph), CmsApplication.kt
     (wipeOfflineStoresForNativeSessionDeath() on logout AND 401; onFullWipe =
     { mediaCacheService.wipe() }; webSessionEndApi()), ShellActivity.kt
     (wires webSessionEnd), test fakes updated (OfflineRuntimeCoordinatorTest
     InMemoryStore, OfflinePackageBridgeServiceTest FakeStore,
     OfflineExamSessionRunnerTest FakeStore/ThrowingStore — all implement
     wipeAll), CmsJsBridgeTest (surface = exactly NINETEEN methods + Phase P
     origin-guard/delegation/throwing tests, all three construction sites
     updated for the new constructor param).
2. `816d62e` feat(offline): W4 D2 — Phase P wipe policy JVM tests
   - OfflinePackageBridgeServiceTest: five Phase P cases — full wipe with a web
     binding (wipeAll counted, onFullWipe fired, states+binding reset →
     status/list honest-absent), full wipe with NOTHING bound (no-op wipe,
     never a skip), selective wipe with a live native session (web user's
     packages invalidated via a real web-token download binding, native user's
     record untouched, media hook NOT fired), binding == native student
     (kept_native_session, zero invalidations), reset() with zero store writes.
     FakeStore: wipeAllCalls counter + invalidate made binding-checked
     (mirrors the production store).
3. `0a34694` feat(offline): W4 D3 — student-web notifies the shell on session end
   - utils/native-bridge.ts: nativeNotifyWebSessionEnded() — feature-detected
     (optional method on CmsNativeBridge), trims the returned code, fail-closed
     null (absent/blank/non-string/throwing); file doc surface updated.
   - services/session-store.ts: clearSession() — the single choke point behind
     logout AND the api-client 401 verdict — fires the notify BEST-EFFORT
     exactly once per call through notifyNativeSideOfSessionEnd() (wrapped,
     never throws). STATIC import (no cycle: native-bridge is a leaf util).
     Honest version-skew comment (older shells = no-op).
   - src/test/offline-wipe-phase-p.test.ts (NEW, 5 cases): spy fires exactly
     once per clearSession call; 401-verdict path covered through the same
     choke point (documented in the suite header — replicating the full axios
     401→refresh→verdict pipeline adds no assertion value); no-bridge +
     pre-Phase-P-shell no-op; throwing bridge never breaks logout.
   - utils/native-bridge.test.ts: Phase P feature-detect block (4 cases).
4. `dc882ed` docs(offline): W4 D4 — Phase P containment audit
   - docs/security/PHASE-P-CONTAINMENT-AUDIT.md (NEW): scope table with one row
     per offline store (a media cache, b question-package envelopes, c W2/W3
     bridge runtime state, d WebView DOM storage, e remember-me seal) ×
     columns (app-private location, encrypted-at-rest, FLAG_SECURE viewer,
     external-intent exposure, bridge bytes/paths exposure, wipe-on-logout
     native, wipe-on-logout web, wipe-on-401, residual notes) — every cell
     filled from code with file citations; the web-end wipe policy + honest
     limitations; enforcement test inventory; explicit residual list.

## Policy as implemented (OfflinePackageBridgeService.onWebSessionEnded)

- No native session → FULL wipe: packageStore.wipeAll() + states/packageIdToKey
  reset + lastWebStudentId=null + onFullWipe() (CmsApplication wires it to
  mediaCacheService.wipe()) → "wiped". Nothing-bound logout is STILL a full
  wipe (no-op wipe, never a skip).
- Native session alive → lastWebStudentId != null AND != native.studentId →
  listAll(webStudent).forEach invalidate; always reset states/binding →
  "kept_native_session". Media hook NOT fired (cache rows are
  installation-scoped, not user-tagged — documented honestly in KDoc + audit).
- reset() (native auth-death): memory-only, zero store writes — the
  application-level wipe (wipeAll + media wipe) owns the stores.

## Quality gates (exact outcomes)

- Android (JAVA_HOME=/home/z/jdks/jdk-21.0.13.1+2, aliyun mirror trick,
  settings.gradle.kts restored in the SAME command, `git diff --stat
  apps/android/settings.gradle.kts` verified EMPTY before every commit):
  `./gradlew :app:testDebugUnitTest --console=plain` → BUILD SUCCESSFUL,
  23 suites / 194 tests / 0 failures / 0 errors / 0 skipped (final run:
  24 tasks up-to-date after the D2 execution; counts read from the XML
  reports).
- `pnpm --filter @cms/student-web exec vitest run` → 81 files / 831 tests
  passed (822 pre-existing unchanged + 5 offline-wipe-phase-p + 4
  native-bridge Phase P).
- `pnpm --filter @cms/student-web exec tsc --noEmit` → exit 0.
- `pnpm --filter @cms/student-web lint` (max-warnings=0) → exit 0.
- Kotlin style: KDoc on every new surface, runCatching posture, no logging, no
  TODOs (grep over the wave diff: clean), no new dependencies (only existing
  JDK/gson/kotlin APIs + the new WebSessionEndApi fun interface in the bridge
  package).

## Deviations / decisions worth recording

1. **WebSessionEndApi is a constructor param WITHOUT a default** on CmsJsBridge
   (following how packageApi was added): the compiler found every construction
   site (ShellActivity + 3 in CmsJsBridgeTest) — nothing silently ships a null
   seam.
2. **CmsApplication gained `webSessionEndApi()`** rather than ShellActivity
   constructing the lambda itself — keeps the exam/packages graph resolution in
   the Application and the activity thin; ShellActivity passes the SAM
   interface instance.
3. **Native-death wipe lives in a private helper**
   (`wipeOfflineStoresForNativeSessionDeath`) shared by clearAuthenticatedStudent
   AND onNativeAuthRejected — order: sessionManager first (media wipe via the
   pre-existing hook), then bridge reset + store wipeAll + lastWebStudentId
   (runCatching around wipeAll as defense-in-depth; the store itself never
   throws).
4. **The 401-verdict web test calls clearSession() directly** (documented in the
   test header): api-client's `isSessionEndingFailure → clearSession()` routing
   is pre-existing Wave A behavior; the Phase P addition is entirely inside
   clearSession, which is what the new tests lock.
5. **FakeStore.invalidate became binding-checked** (mirrors the production
   EncryptedOfflinePackageStore) so the selective-wipe test proves the SERVICE
   passes the right (webStudent) binding, not that the fake is loose.
6. **OfflineExamSessionRunnerTest.ThrowingStore.wipeAll() = Unit** — the
   runner never wipes; the FakeStore's counted wipeAll staying 0 is the
   ownership proof (wipe authority stays with CmsApplication).
7. Honest audit notes that survived into the doc: native logout does NOT
   directly wipe WebView DOM storage (D1 separation — the web rows die at the
   next web-side verdict, which NOW chains the native wipe); an exam-answer
   sync 401 maps to an honest AUTH_REJECTED disposition without wiping (the
   wipe lands when session death reaches a wired funnel).
