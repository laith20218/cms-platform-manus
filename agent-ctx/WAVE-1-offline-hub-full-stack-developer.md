# WAVE-1 — Offline Hub 1D (student-web UI layer)

Task ID: WAVE-1 (branch `feat/offline-hub-1d-ui`, base `origin/main` @ c154013)
Scope: apps/student-web ONLY. No apps/api / apps/android changes (Waves 2/5 own those).
Status: DONE — tsc clean, lint clean, vitest 805/805 (776 existing unchanged + 29 new).

## What shipped

1. **`src/utils/native-packages.ts`** (new) — feature-detected offline PACKAGES bridge
   wrapper. Method names are the cross-wave contract (Wave 2 implements the Kotlin
   side): `listOfflinePackages`, `downloadOfflinePackage`, `offlinePackageStatus`,
   `removeOfflinePackage`, `openOfflineExam`. Row validation mirrors
   native-cache.ts (trim, MAX id 256, malformed rows dropped, broken JSON → null,
   throwing bridge → null). Exports `isNativePackagesSurfaceActive`,
   `nativeListOfflinePackages`, `nativeDownloadOfflinePackage` (serializes
   requestJson itself; requires subjectId OR examId, else null),
   `nativeOfflinePackageStatus`, `nativeRemoveOfflinePackage`,
   `nativeOpenOfflineExam`, `nativePackageDenyMessage` (exact Arabic strings for
   denied_native_session / denied_auth / denied_offline / denied_stale /
   denied_disabled / quota / error:*; invalid_args → null), and
   `nativePackageDownloadToast` (started/queued/downloading → «بدأ تحميل حزمة
   الأسئلة…», ready → «الحزمة محفوظة مسبقاً.»).

2. **`src/utils/native-courses.ts`** (new) — feature-detected HOSTED COURSE episodes
   wrapper (Wave 5 contract): `listOfflineCourseEpisodes`,
   `ensureCourseEpisodeLocal`, `courseEpisodeStatus`,
   `removeOfflineCourseEpisode`, `openOfflineCourseEpisode`. Same validation
   rigor; tailored Arabic deny map (denied_offline: «لا يوجد اتصال — تحميل حلقات
   الكورس يحتاج اتصالاً مرة واحدة.»). Exports
   `YOUTUBE_EPISODE_OFFLINE_NOTE` and `nativeCourseDownloadToast`.

3. **`src/features/offline/OfflinePanel.tsx`** (rewritten) — three-tab hub
   («الملفات» | «حزم الأسئلة» | «الكورسات»), role=tablist + aria-selected +
   arrow-key navigation. Media tab is the DEFAULT (existing offline-mode tests
   pass with ZERO edits — verified). Media list extracted into
   `OfflineMediaList` with every original data-testid preserved
   (offline-panel-list, offline-item-*, offline-panel-empty,
   offline-panel-browser-empty, offline-panel-meter, uncacheable-note…).
   New testids: `offline-panel-tab-{media,packages,courses}`,
   `offline-packages-unavailable` (older shell: «حزم الأسئلة دون اتصال تتوفر
   بعد تحديث التطبيق إلى الإصدار الأحدث.»; plain browser: own honest line),
   `offline-packages-empty`, `offline-packages-list`, `offline-package-{id}`,
   `offline-package-status-{id}` (صالحة/ملغاة/غير مؤكدة),
   `offline-package-open-{id}` («بدء الامتحان»), `offline-package-remove-{id}`,
   and the mirrored `offline-courses-*` set. Panel refresh sweeps all active
   surfaces (manual — no polling in W1). Storage meter stays media-only and now
   renders on the media tab. Uncacheable note: media tab keeps
   UNCACHEABLE_OFFLINE_NOTE; courses tab carries YOUTUBE_EPISODE_OFFLINE_NOTE
   (see deviations).

4. **`src/features/offline/OfflineDownloadCta.tsx`** (new) — shared CTA used by all
   three pages. Invisible in plain browsers (hasNativeShell gate). Older shell →
   honest toast («تحميل الحزم دون اتصال يتوفر بعد تحديث التطبيق.» / courses
   variant). Surface present → wrapper call; toast per
   nativePackageDownloadToast / nativeCourseDownloadToast (deny → toast.error,
   started/ready → toast.message). Reads accessToken via
   readSession() from '@/services/session-store'. Variants: 'button'
   (icon+label, min-h-11) and 'icon' (36px, aria-label).

5. **Page wiring**
   - ExamPage: `exam-offline-download-cta` in the exam-phase header (exam phase
     only; header got flex-wrap so 375px keeps 44px targets). Passes **examId
     only** — ExamSession/ExamQuestion DTOs carry no subject identifier and the
     route is exam-scoped (documented in code comment at the CTA).
   - SubjectDetailPage: `subject-offline-download-cta` («تحميل أسئلة المادة دون
     اتصال») in the subject header card, subjectId from the :subjectSlug query.
   - CoursePlayerPage: per-episode `episode-offline-cta-{episodeId}` icon button
     for Upload (non-YouTube) episodes in the playlist rows; YouTube episodes get
     NO button (courses-tab note covers honesty). Row restructured: border moved
     from the row button to the <li> so the CTA is a SIBLING button (no nested
     buttons / broken a11y); plain browser renders the row exactly as before.

6. **`src/test/offline-hub-1d.test.tsx`** (new, 29 tests) — wrapper rigor (parse /
   malformed / throwing / trimmed ids / exact deny strings / requestJson
   serialization / scopeless → null), panel hub (three tabs, default=media,
   keyboard, honest states, rows, remove+refresh, empty states), CTA component
   (hidden in browser, honest toasts, started/deny/ready toasts, token passing),
   ExamPage integration via mocked exam-api (CTA absent in browser, present +
   functional in shell).

## Quality gates (all green)

- `pnpm --filter @cms/student-web exec tsc --noEmit` → clean
- `pnpm --filter @cms/student-web lint` (eslint . --ext ts,tsx --max-warnings=0) → clean
  (no ESLINT_USE_FLAT_CONFIG needed)
- `pnpm --filter @cms/student-web exec vitest run` → **805 passed (805)**, 79 files
  (baseline before W1: 776 / 78 files; zero existing tests modified)

## Deviations from spec (with reasons)

- `nativeDownloadOfflinePackage` input types `subjectId` as OPTIONAL (spec showed
  it required but also instructs the exam CTA to omit it when unavailable — the
  type had to allow both; at least one of subjectId/examId is enforced).
- Courses tab shows `YOUTUBE_EPISODE_OFFLINE_NOTE` instead of the literal
  UNCACHEABLE_OFFLINE_NOTE text: the old note ("course episodes are never
  stored") would contradict the hosted-episode rows the tab lists once Wave 5
  ships. Media tab keeps the original note verbatim; the note block itself
  (testid offline-panel-uncacheable-note) stays visible on both tabs.
- Package `quota` message tailors the native-cache wording («…بعض الحزم أو
  الملفات…») since packages share the same 5 GiB media cache quota.
- `offline-packages-unavailable` renders in BOTH the older-shell and plain-browser
  cases (spec asked for the testid on the shell case and "its own honest line" in
  the browser; the text switches by shell presence).

## Pointers for later waves

- Wave 2 (Android packages): implement the five `CmsNativePackageBridge` methods
  verbatim on `window.CmsNative`; the web side is already wired and tested.
  Download request JSON: `{subjectId?, examId?, accessToken?, title?}` (examId
  only from the exam page CTA).
- Wave 5 (Android course episodes): same for `CmsNativeCourseBridge`; episode
  JSON: `{episodeId, courseId?, title?, assetType?('video'|'audio')}`.
- Status codes consumed by the UI today: `started | queued | downloading* |
  ready | absent | denied_native_session | denied_auth | denied_offline |
  denied_stale | denied_disabled | quota | error:*`.
- Panel refresh is manual (W1 contract) — a Wave 2+ progress feed can hook into
  `CacheProgressBus`-style events later; do not add polling on the web side.
