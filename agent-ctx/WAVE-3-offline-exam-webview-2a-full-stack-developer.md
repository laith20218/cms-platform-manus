# WAVE-3 — Offline Exam WebView 2A (offline questions render in the SAME React exam UI)

Task ID: WAVE-3 (branch `feat/offline-exam-webview-2a`, base `feat/offline-packages-download-3c` @ 89b65e0, stacked — no rebase, no push, no PR)
Scope: apps/android + apps/student-web. apps/api UNTOUCHED. OfflineExamActivity.kt (the native
MainActivity fallback) UNTOUCHED — verified with an empty `git diff 89b65e0..HEAD` on that file.
Status: DONE — gradle `:app:testDebugUnitTest` 187/187 (23 classes), vitest 822/822
(806 pre-existing unchanged + 16 new), tsc clean, lint clean (max-warnings=0).

## Mission recap

The offline exam was a native Kotlin RadioGroup screen. Wave 3 adds a NEW hardened WebView
activity (OfflineExamWebActivity) that loads the student-web at the NEW PUBLIC route
`/offline-exam/:packageId`, plus a DEDICATED bridge (`window.CmsOfflineExam` — different
interface name, different WebView) serving the decrypted ephemeral payload + answer capture +
sync. The React page REUSES the shared QuestionRow with a mirrored exam-phase chrome. After
this wave the panel's «بدء الامتحان» button (W1 UI calling nativeOpenOfflineExam) launches
this activity (native examLauncher seam).

## Commits (5, one per deliverable)

1. `5260983` feat(offline): W3 D1 — dedicated CmsOfflineExam bridge + OfflineExamWebActivity (UX 2A)
2. `0587583` feat(offline): W3 D2 — panel «بدء الامتحان» launches the exam webview (UX 2A)
3. `204f8b5` feat(offline): W3 D3 — JVM tests for the exam bridge + session runner (UX 2A)
4. `b526460` feat(offline): W3 D4 — student-web /offline-exam/:packageId player page (UX 2A)
5. `ca38b91` feat(offline): W3 D5 — offline exam player regression suite (UX 2A)

## What shipped (Android)

- **`bridge/OfflineExamBridge.kt`** (new) — the SEPARATE `@JavascriptInterface` class,
  JS_NAME="CmsOfflineExam", injected ONLY into the exam activity's WebView. Constructor is
  exactly the task's fakeable shape: `(currentUrl, urlPolicy, payloadProvider, answerCapture,
  submitRequest, syncStatus)` — no Android types in the logic. Every method re-checks
  `urlPolicy.isAllowed(currentUrl())` (origin guard) and never throws (`guarded()`); ids are
  canonical-UUID validated via `OfflinePackageBridgeService.PACKAGE_ID_PATTERN` + 256 cap;
  duration 0..86400. `getOfflineExamPayload()` answers `{"phase":"loading"}` /
  `{"phase":"denied","code":…}` (denied_origin outside the allowlist) /
  `{"phase":"ready","payload":…}` — the ready wrapper is a plain concat around the payload
  JSON the state serialized ONCE (no per-poll re-serialization). Contains the pure contract
  types: `ExamPayload`/`ExamQuestionPayload`/`ExamQuestionOptionPayload`/
  `ExamPendingAnswerPayload` + `ExamPayloadState` (Loading / Denied(code) /
  Ready(payload, cached json)) + `serializeExamPayload` (Gson tree builder, exact field names).
- **`bridge/OfflineExamSessionRunner.kt`** (new) — pure-JVM state machine the activity
  delegates to (activity stays thin). Takes (packageId, session, store, runtime facade
  lambdas openOnline/continueOffline/captureAnswer/pendingAnswers/sync, executor, clock).
  Lifecycle: session null → denied_session; store load null → absent; manifest.allowedSubjects
  empty or expired (clock pre-gate) → denied_package; `openOnline ?: continueOffline` null →
  denied_package; else Ready(payload + pendingAnswers). captureAnswer runs the store write on
  the executor with a BOUNDED 15s wait (queues only behind the initial load or one in-flight
  sync; timeout fails closed to denied — page reverts, no fake success). requestSubmit sets
  syncCode submitting → disposition.name.lowercase (retryable_failure on a throwing sync).
- **`OfflineExamWebActivity.kt`** (new, root package) — FLAG_SECURE, packageId extra (UUID)
  or finish(), PROGRAMMATIC WebView (FrameLayout + honest error overlay reusing the shell's
  R.string error strings + retry), `WebViewHost(webView, urlPolicy, ::showError).attach()`
  then the NEW `host.attachExamBridge(OfflineExamBridge(...))`, then loads
  `STUDENT_WEB_BASE_URL + /offline-exam/<uuid>` (validated against the policy else
  InvalidConfiguration). Session/runtime resolve ONCE via CmsApplication
  `offlineExamRuntimeBinding()`; the runner is constructed over that binding and its
  fail-closed lambdas. onPause/onResume/onDestroy mirror ShellActivity; back goes through
  WebView history first. Companion `intent(context, packageId)` adds FLAG_ACTIVITY_NEW_TASK
  (the production caller is the Application-context launcher).
- **`shell/WebViewHost.kt`** — NEW `attachExamBridge(bridge: OfflineExamBridge)` +
  honest KDoc update of the "NO second addJavascriptInterface" sentence: the invariant is
  now "one audited interface per WebView" (shell=CmsNative only, exam=CmsOfflineExam only,
  never two in the same view).
- **`CmsApplication.kt`** — `@Volatile var lastWebStudentId: UUID? (private set)` mirrored
  from the bridge service via the NEW `onWebStudentBound` constructor callback;
  `offlineExamSession()` = `activeSessionForMedia() ?: lastWebStudentId` as a TOKEN-LESS
  OfflineSession ("", installationId) — open/answer work offline, sync fails honestly;
  `offlineExamRuntimeBinding()` (coordinator + resolved session → OfflineExamRuntimeBinding
  data class); `offlinePackageStoreForExams()` accessor for the shared encrypted store; W3
  D2 wires `examLauncher` = main-thread Handler post → `startActivity(OfflineExamWebActivity.intent(...))`.
- **`bridge/OfflinePackageBridgeService.kt`** — `onWebStudentBound: (UUID) -> Unit = {}`
  invoked at BOTH `lastWebStudentId` write sites (fast path + runDownload); D2 rewrote
  `openOfflineExam`: UUID → runtime null → denied_disabled → storeBoundStudentId null →
  denied_native_session → store record null → absent → expiresAt not after clock →
  NEW `denied_stale` → else `examLauncher(packageId)` + NEW `opening`. ERROR_EXAM_UI_PENDING
  constant DELETED (no Kotlin references left; CmsJsBridge KDoc updated). The web-side
  deny-map entry `error:exam_ui_pending` in native-packages.ts stays as an honest
  version-skew defense (old app + new web) and its W2 test still passes.
- **AndroidManifest.xml** — OfflineExamWebActivity registered `exported="false"
  noHistory="true"` following the existing style.

## What shipped (student-web)

- **`src/utils/native-offline-exam.ts`** (new) — feature-detected `window.CmsOfflineExam`
  wrapper (native-packages rigor): `isOfflineExamBridgeActive()` (checks the four methods,
  NOT hasNativeShell — this bridge lives in a different WebView), `getOfflineExamPayload()`
  phase union with full field validation (trim, caps, non-empty options, opaque ids ≤256,
  malformed → null fail closed), `captureOfflineAnswer` (trimmed ids, floored duration,
  bounds; unknown codes → null), `submitOfflineExam` ('submitting' only),
  `getOfflineExamSyncStatus`, and `OFFLINE_EXAM_SYNC_MESSAGES` — the exact Arabic map
  mirroring the native OfflineExamActivity strings.
- **`src/app/router.tsx`** — PUBLIC lazy route `/offline-exam/:packageId` (above the
  ProtectedRoute block, next to the legal routes).
- **`src/features/offline/OfflineExamPage.tsx`** (new) — the 2A page: phase machine
  (loading poll 600ms/immediate first tick, 20s → timeout; denied per-code Arabic messages;
  ready; browser honesty «هذه الصفحة تعمل داخل تطبيق أندرويد فقط بعد تحميل حزمة أسئلة.»).
  Ready renders the EXACT shared QuestionRow (same import, testIdPrefix="offline-exam") in
  the ExamPage exam-phase chrome (glass header with مجاب: X من M + صالحة حتى: date,
  progress meter, sticky submit). Single-select semantics (selected=[optionId]), optimistic
  selection + synchronous capture; deny/null → revert + toast «تعذر حفظ الإجابة لأن الحزمة
  لم تعد صالحة.». Per-question Date.now() duration accumulator (seconds, floor, cap 86400,
  reset per answer). pendingAnswers restore on ready. Submit: CenteredDialog confirm →
  submitOfflineExam() → poll sync status 700ms/60s → toast (success/info/error by code) +
  inline result banner (offline-exam-result) with the honest default fallback for unknown
  codes; the exam stays browsable. RTL, var(--c-*) tokens, min-h-11 targets, data-testids
  offline-exam-{root,loading,denied,list,submit,result,browser}. NO storage writes.

## Tests

- **Android `bridge/OfflineExamBridgeTest.kt`** (15 tests): origin guard on all four methods
  (foreign host/scheme/port/file/blank + blocking policy), exact phase-JSON field names via
  JsonParser, arg validation, result mapping, throwing-seam degradation, syncStatus
  passthrough, JS-name + exact-four-methods surface audit.
- **Android `bridge/OfflineExamSessionRunnerTest.kt`** (13 tests): absent → denied; null
  session → denied_session before store reads; openOnline → ready with pendingAnswers;
  openOnline-null + continueOffline → ready; both null → denied_package; expired manifest
  pre-gate; subject-less manifest; throwing store → fail closed; capture passthrough +
  bounds; every OfflineSyncDisposition lowercase mapping; throwing sync → retryable_failure.
- **Android W2 updates**: openOfflineExam launcher fires exactly once on success / never on
  deny paths (frozen launcher fake), stale/absent/disabled/unbound codes, onWebStudentBound
  reports bindings from both web-session paths; CmsJsBridgeTest fakes updated to `opening`.
- **student-web `src/test/offline-exam-2a.test.tsx`** (16 tests): wrapper phases + malformed
  + throwing → null + arg validation + Arabic map; page browser/ready/restore/selection/
  deny-revert/submit-flow(submitting→synced)/denied/malformed screens. Suite total 822.

## Quality gates (exact outcomes)

- `cd apps/android && ./gradlew :app:testDebugUnitTest --rerun-tasks` (aliyun mirror trick,
  settings.gradle.kts restored in the same command, verified empty diff) → BUILD SUCCESSFUL,
  187 tests / 0 failures / 0 errors / 0 skipped.
- `pnpm --filter @cms/student-web exec vitest run` → 80 files / 822 tests passed.
- `pnpm --filter @cms/student-web exec tsc --noEmit` → clean.
- `pnpm --filter @cms/student-web lint` (max-warnings=0) → clean.

## Deviations / decisions worth recording

1. **Runtime resolution shape**: instead of `authenticatedOfflineRuntime()` (activeSession
   only), the activity resolves `offlineExamRuntimeBinding()` = coordinator + the W3
   `offlineExamSession()` (native OR token-less last-web-student binding) — this honors both
   task statements ("runtime null → Denied(denied_session)" and "token-less web binding …
   fine offline; sync will fail honestly"): ANY resolution failure (no session OR
   trusted-offline off) lands in the same honest denied_session phase, and a resolvable
   web binding can open/answer offline.
2. **Capture threading**: the task's "captureAnswer on the executor, boolean result" is
   implemented as a FutureTask + bounded 15s wait on the single-thread executor — never an
   unbounded block of the JavaBridge thread, fail-closed to "denied" on timeout (page
   reverts with its Arabic toast). Load/sync stay async on the same executor.
3. **Ready JSON shape**: `ExamPayloadState.Ready` caches the PAYLOAD serialization; the
   bridge wraps it in `{"phase":"ready","payload":…}` via concat (ASCII constants around
   Gson-escaped output) — caught by the D3 tests (initially returned the payload unwrapped).
4. **`isOfflineExamBridgeActive` does NOT use `hasNativeShell()`** — the exam WebView has no
   CmsNative at all; feature detection reads `window.CmsOfflineExam` directly.
5. **ERROR_EXAM_UI_PENDING web entry kept** (native-packages.ts deny map): an older APK
   paired with this web build still gets the honest Arabic upgrade message; only the Kotlin
   constant was deleted.
6. Sync with the token-less binding maps to forbidden/auth_rejected per the COORDINATOR's
   existing refresh-first mapping (the task's "auth_rejected" parenthetical is the typical
   path; both are honest disposition codes with dedicated Arabic messages).
7. **known limitation (inherited from the task's architecture)**: the player page itself
   loads over the network from STUDENT_WEB_BASE_URL like the rest of the SPA — a fully
   offline cold start of the ACTIVITY shows the shell-style honest network error; answers
   captured after the page loads stay offline in the encrypted store. No WebView cacheMode
   deviation was made (hardening parity with ShellActivity).
