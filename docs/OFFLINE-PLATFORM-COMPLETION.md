# Offline Platform — Completion Matrix (Waves 1–6)

Wave-6 artifact. The state of the offline platform after the six implementation
waves (#196–#201), the final capability matrix, the exact JS-bridge allowlists,
the release-build flags, and the honest gap-closure + residual lists. Policy
and constants live in `docs/offline-program.md`; run the manual device
acceptance in `docs/OFFLINE-AIRPLANE-ACCEPTANCE.md`.

## 1. Capability matrix

| Capability | Wave / PR | Status | Verified by |
|---|---|---|---|
| Question-package issuance (AES-GCM + signed manifest + device-bound key wrap + idempotency + ≤7d expiry) | pre-program / #194 | ✅ shipped | API unit + HTTP integration tests |
| Library media offline (PDF/txt/html/image/audio/video, API bytes, JWT + signed entitlement) | Batch 4 | ✅ shipped | JVM + instrumentation + e2e |
| Offline hub — three-section OfflinePanel (media \| packages \| course episodes) + contextual CTAs on exam/subject/course pages | W1 / #196 | ✅ shipped | vitest 805 |
| Web-JWT package download (3C — shell CTA → native envelope store, no native login needed) | W2 / #197 | ✅ shipped | 159 JVM + integration |
| Offline exam in the SAME React exam UI (2A — `/offline-exam/:packageId`, `CmsOfflineExam` ephemeral webview, encrypted-store answers, sync dispositions) | W3 / #198 | ✅ shipped | 187 JVM + 822 vitest |
| Phase P containment (wipe on web logout, native logout, 401; store wipeAll; containment audit doc) | W4 / #199 | ✅ shipped | 194 JVM + 831 vitest + audit matrix |
| Hosted course-media CONTENT endpoint (API bytes channel, entitlement-gated, media-offline rate policy) | W5 / #200 | ✅ shipped | 31 API tests |
| Phase Q chunked AV at rest (4 MiB encrypted chunks, no complete clear file) | W5 / #200 | ✅ shipped | chunk planner + store JVM tests |
| In-process reassembly playback (loopback-only HTTP server, Range/206, per-instance token; FLAG_SECURE player) | W5 / #200 | ✅ shipped | real-socket JVM tests |
| Combined 5 GiB quota (library cache + chunked episodes, LRU) | W5 / #200 | ✅ shipped | service eviction tests |
| Admin revoke / revocation enforcement at next online contact | pre-program | ✅ shipped | API integration |
| YouTube / external URLs offline | — | ❌ never (owner decision 5, honest Arabic notes) | UI copy |
| Play Integrity attestation | — | ⚠️ stub (`NOT_CONFIGURED`) | recon |
| Widevine / DRM program | — | ❌ non-goal | — |

## 2. Final JS-bridge allowlists (the audited surfaces)

**`window.CmsNative` — 24 `@JavascriptInterface` methods** (locked by
`CmsJsBridgeTest` "the js surface is exactly the twenty-four approved
methods"; token accessors explicitly absent):

| # | Method | Since |
|---|---|---|
| 1–4 | `hasNativeShell`, `getPlatform`, `getAppVersion`, `getInstallationId` | Batch 3 |
| 5–11 | `listCached`, `ensureLocal`, `openLocal`, `cacheStatus`, `cancelDownload`, `removeCached`, `clearCache` | Batch 4 |
| 12–13 | `sealForLocalPersistence`, `unsealForLocalPersistence` | D-JS-AUTH |
| 14–18 | `listOfflinePackages`, `downloadOfflinePackage`, `offlinePackageStatus`, `removeOfflinePackage`, `openOfflineExam` | W2 |
| 19 | `notifyWebSessionEnded` | W4 |
| 20–24 | `listOfflineCourseEpisodes`, `ensureCourseEpisodeLocal`, `courseEpisodeStatus`, `removeOfflineCourseEpisode`, `openOfflineCourseEpisode` | W5 |

**`window.CmsOfflineExam` — 4 methods** (W3; injected ONLY into the
`OfflineExamWebActivity` WebView, never the main shell):
`getOfflineExamPayload`, `captureOfflineAnswer`, `submitOfflineExam`,
`getOfflineExamSyncStatus`.

D1 invariant (both surfaces): **no** `getAccessToken` / `getRefreshToken` /
password / raw-path / raw-bytes / arbitrary-URL-fetch methods. The only token
flow is web→native inside a download request (the page supplies its own JWT;
the bridge never returns one).

## 3. Offline storage map (all app-private, encrypted at rest)

| Store | Location | Crypto | Wipe triggers |
|---|---|---|---|
| Library media (whole files) | `filesDir/media-cache/` | AndroidX EncryptedFile (MasterKey) | web/native logout, 401, clearCache, quota |
| Question-package envelopes | `filesDir/offline-envelopes/` | AndroidX EncryptedFile | same + revoke-driven invalidation |
| Course episodes (Phase Q) | `filesDir/media-chunks/{id}/chunk-*.bin` | per-chunk EncryptedFile | same |
| Episode meta | `filesDir/media-chunks/{id}/episode.json` | EncryptedFile | same |
| Native tokens | `filesDir` (TokenStore) | EncryptedFile | logout / 401 |
| WebView remember-me | WebView storage | AndroidKeyStore `v1:` seal | web session end |

## 4. Gap closure (recon → wave map)

| Recon gap | Closed by |
|---|---|
| No contextual download CTAs | W1 #196 |
| Packages/courses not managed in the panel | W1 #196 (UI) + W2/W5 (native) |
| Package download required the MainActivity UUID form | W2 #197 (web CTA is primary; MainActivity stays as explicit-intent fallback) |
| Offline exam was Kotlin-only UI | W3 #198 |
| Web logout left native stores intact | W4 #199 |
| Hosted course episodes had no API-byte path | W5 #200 (`GET /api/v1/media/{assetType}/{assetId}/content`) |
| No chunked at-rest AV | W5 #200 |
| Transport hardcoded the library route | W5 #200 (`ContentSource`) |

## 5. Android release build — the offline `-P` flags (values from env/CI, NEVER committed)

```bash
./gradlew :app:assembleRelease \
  -PSTUDENT_WEB_BASE_URL="$STUDENT_WEB_BASE_URL" \
  -PAPI_BASE_URL="$API_BASE_URL" \
  -POFFLINE_TRUSTED_CLIENT_IMPLEMENTED=true \
  -POFFLINE_API_BASE_URL="$API_BASE_URL" \
  -POFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64="$OFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64" \
  -POFFLINE_KEYSTORE_ALIAS=cms.offline.package.key \
  -POFFLINE_API_SPKI_PINS_MANDATORY=true \
  -POFFLINE_API_SPKI_PINS_BASE64="$OFFLINE_API_SPKI_PINS_BASE64"
```

- Fail-closed: the build refuses on incomplete combinations; the runtime
  backstop (`AndroidOfflineBuildConfiguration`) throws on enabled-but-incomplete.
- The SPKI values are PUBLIC key material (the private ECDSA key lives only in
  the Render env — `Security__Offline__ManifestSigningPrivateKeyPkcs8`); never
  put private keys in the repo, the APK, or chat logs.
- The `W3` offline-exam route requires the deployed student-web to include
  `/offline-exam/:packageId` — build the APK against the CURRENT deploy.

## 6. Ops state at handoff (yes/no only — no secret values)

| Item | State |
|---|---|
| Render `Features__Offline*` (all six) | yes — `true` |
| Render `Security__Offline__*` (all three) | yes — owner-provisioned, untouched |
| Render `/health` | yes — 200 |
| `/api/v1/offline/packages` without auth | 401 (fail-closed correct) |
| Vercel student-web `VITE_API_URL` | yes — set (production target); redeploy after W1–W6 merges so the new routes/CTAs ship |
| Authenticated offline-route 200 check | not run (no test student credentials in the executor sandbox — needs an owner-issued test login) |

## 7. Residual list (honest)

1. **Emulator CI red**: 2 pre-existing `OfflineRuntimeInstrumentationTest`
   failures (API 35), red on `main` since ≥ 2026-11-21 — pre-dates every wave;
   not introduced by the offline program (evidence: run history).
2. **Exam-webview cold start** needs the SPA loadable: pure airplane + killed
   process shows the honest network error; online-first load, then airplane
   continuation works (R2 in the acceptance doc).
3. **Course-episode downloads need a native session** (entitlement issuance
   lives on the native session): shell-only web students get an honest
   `denied_native_session`. Question packages work via the web JWT (W2).
4. **No transport resume** for course-episode downloads (restart on drop);
   no API Range on the content route (parity with the library route).
5. **Legacy viewers' temp decrypt-for-view** files (whole-file library media);
   chunked course playback has NO temp file (in-process reassembly only).
6. **Revocation latency while offline** — takes effect at the next online
   contact (accepted tradeoff of expiry-bound rights).
7. **Play Integrity stub**; pinning mandatory-capable but pipeline-discipline.
8. **Media-cache rows are not user-tagged** — with a live native session, a
   web logout cannot selectively wipe media (full wipe happens when no native
   session exists) — documented in the Phase P audit.
9. Rooted/advanced attackers are out of scope — the program is strong
   anti-casual-exfiltration, not DRM (see `docs/security/PROTECTION-LIMITS.md`).
