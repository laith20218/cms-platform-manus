# Offline Platform — Airplane-Mode Acceptance Script (Owner manual steps)

Wave-6 artifact. This is the **manual device acceptance** for the complete
offline platform (Waves 1–5: offline hub, question packages via web CTAs,
offline exam in the React UI, Phase P wipes, hosted course episodes with
Phase Q chunked playback). Run it after every release build that touches the
offline surface. Expected outcomes are **honest** — where a path is a
documented residual it says so instead of pretending success.

Companion docs: `docs/offline-program.md` (policy + constants),
`docs/OFFLINE-STUDENT-HOWTO-AR.md` (student guide),
`docs/OFFLINE-PLATFORM-COMPLETION.md` (capability matrix + residuals),
`docs/PHASE-P-CONTAINMENT-AUDIT.md` (containment matrix).

## 0. Preconditions

| # | Requirement | How to check |
|---|---|---|
| P1 | Release APK built with the offline `-P` flags (see `docs/OFFLINE-PLATFORM-COMPLETION.md` §5) | build log shows all four offline flags + SPKI |
| P2 | API live with the six `Features__Offline*` flags `true` and the three `Security__Offline__*` keys set (Render) | `scripts/ops/verify-offline-readiness.sh https://<api-host>` → all PASS |
| P3 | Student account with an active subscription covering the test subject | login works, subject visible |
| P4 | Test data: a **published** course with ≥2 Upload episodes + ≥1 YouTube episode; a library with a PDF + a video; an exam with questions on the subject | admin console |
| P5 | The student-web deployed (Vercel) at the URL the APK was built with | open the shell — the SPA loads |
| P6 | Admin account with the OfflineCenter page | admin console → القياس والتدقيق |

## 1. Online phase (download everything)

1. Launch the app → the shell loads student-web. Log in with the student
   account. **Expect:** normal web UX; the «وضع بدون إنترنت» control is in
   the Navbar.
2. Open `/exams/<examId>` → tap **«تحميل دون اتصال»** in the exam header.
   **Expect:** toast «بدأ تحميل حزمة الأسئلة…» (web-JWT path, W2/3C — no
   native login needed). The panel's **حزم الأسئلة** tab lists the package:
   صالحة badge, question count, expiry date.
3. Open the subject page → tap **«تحميل أسئلة المادة دون اتصال»**.
   **Expect:** same flow for the subject-scoped package.
4. Open the course player → on an **Upload** episode tap the download icon.
   **Expect:** «بدأ تحميل الحلقة…»-style progress; the panel's **الكورسات**
   tab lists the episode with size. On the **YouTube** episode there is NO
   download button and the panel carries the note «حلقات يوتيوب تُشاهَد من
   الويب فقط…» — honest by design.
5. Open a library PDF and a library video from the library tab.
   **Expect:** auto-cache on first open (existing behavior); panel **الملفات**
   tab lists both; storage meter shows bytes/5 GiB.
6. (Optional, native fallback path) `adb shell am start -n
   com.cms.student/.MainActivity` → phone/password login → UUID download →
   the Kotlin offline exam still works. **Expect:** unchanged legacy path.

## 2. Airplane phase (everything opens offline)

1. Keep the app in the foreground (the SPA must stay alive — see residual R3),
   enable airplane mode, then reopen the «وضع بدون إنترنت» panel.
   **Expect:** red banner «يبدو أنك دون اتصال الآن…»; all three tabs still
   list their rows.
2. Panel → **حزم الأسئلة** → **بدء الامتحان** on the exam package.
   **Expect:** `OfflineExamWebActivity` opens — **the same React exam UI**
   (QuestionRow list, counter, submit flow). Answer questions; the answers
   persist (kill the activity, reopen — selections restored from the
   encrypted store). Submit → «لا توجد شبكة؛ بقيت الإجابات مشفرة محلياً
   للمحاولة اللاحقة.»
3. Panel → **الكورسات** → open the downloaded Upload episode.
   **Expect:** `OfflineCoursePlayerActivity` (FLAG_SECURE) plays from the
   chunked store via the loopback reassembly server; seek works (HTTP Range
   over chunks). No complete clear media file exists on disk — verify with
   `adb shell run-as com.cms.student ls files/media-chunks/<episode-id>/`
   (only `chunk-*.bin` + `episode.json`).
4. Panel → **الملفات** → open the cached PDF and video. **Expect:** in-app
   viewers open offline (existing Batch-4 behavior).
5. Try the YouTube episode in the course player. **Expect:** the web player
   fails to load (no network) — no fake offline mode, per owner decision 5.

## 3. Back online phase (sync + rights enforcement)

1. Disable airplane mode. In the offline exam (or reopening it), submit.
   **Expect:** sync disposition «تمت مزامنة الإجابات بنجاح.»; the exam rows
   in the admin console / API show the answers; the panel's pending-answer
   count drops to 0.
2. Admin → OfflineCenter → the package row is ACTIVE. **Revoke** it
   (confirm-gated). Airplane again → **بدء الامتحان** → **Expect:** refused
   with the Arabic denial (the revocation was picked up at the last online
   contact / open attempt). Online open (`openOnline`) also refuses.
3. Expiry bound: wait for (or lower) the package `expiresAt` → offline open
   refuses even with a recent confirmation — «انتهت صلاحية الحزمة المحفوظة.».
4. **Wipe-on-logout (Phase P, W4):** in the shell, log out of the WEB session
   (no native login active). **Expect:** the native stores wipe — the panel
   lists nothing in any tab; `adb shell run-as com.cms.student ls
   files/media-cache files/media-chunks files/offline-envelopes` are empty.
5. **Wipe-on-401 (native path):** log in via MainActivity, invalidate the
   session server-side (rotate the refresh token from another device), open a
   cached file → **Expect:** 401 → full wipe (tokens + media + chunks +
   envelopes).
6. Storage quota: download until the panel meter approaches 5 GiB →
   **Expect:** LRU eviction of the oldest cached items (media + chunked
   episodes share the cap); a single item larger than the cap refuses with
   the Arabic quota message.

## 4. Evidence to record

- Per step: PASS/FAIL + one line of notes (screenshots are blocked by
  FLAG_SECURE by design — use written notes or `adb logcat` excerpts).
- `scripts/ops/verify-offline-readiness.sh` output for P2.
- Device build fingerprint + APK versionName + student-web deploy URL.

## 5. Known residuals you WILL hit (expected, documented)

| ID | Residual | Where |
|----|----------|-------|
| R1 | Emulator CI: 2 pre-existing `OfflineRuntimeInstrumentationTest` failures on android-35 (red on main since ≥ 2026-11-21) | CI logs |
| R2 | Cold start of the offline-exam webview needs the SPA loadable (network or warm process); pure airplane + killed process shows the honest network error | W3 PR #198 |
| R3 | Web-session-only students (no native login) cannot download course episodes (`denied_native_session`) — question packages DO work via web JWT | W5 PR #200 |
| R4 | No transport-level resume: a dropped course-episode download restarts | W5 PR #200 |
| R5 | Temp decrypt-for-view files for the legacy whole-file viewers; revocation latency while offline | `docs/offline-program.md` §6 |
