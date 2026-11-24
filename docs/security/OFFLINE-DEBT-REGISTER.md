# Offline Engineering Debt Register — سجل الديون الهندسية

Created at the close of the offline program (Owner decisions 2026-11-23; PRs
#182–#186). Each item is a deliberate, accepted deferral — recorded here so it
cannot be forgotten, with a one-line reason and the state it leaves the product in.

**Status 2026-11-24: ALL THREE DEBTS CLOSED** by the security-hardening debt
program (PRs #187, #188, #189 — see the closure table below). This register is
kept as the audit trail; residuals are recorded per item.

| ID | Debt | Status | Why it was deferred (one line) | What this leaves the product with |
|---|---|---|---|---|
| `D-PIN` | **Certificate pinning is not mandatory for store builds.** `OFFLINE_API_SPKI_PINS_BASE64` defaulted to empty (`OfflineCertificatePinning.parsePins("")` → no pinning; transport fell back to system trust + HTTPS-only). | **CLOSED** — PR #187 (merge `4338753`), branch `feat/debt-d-pin-certificate-pinning` | Pin setup needed the release team's real SPKIs and a rotation plan — forcing it with placeholder pins would have bricked pilot builds. | Store/release builds fail closed: `-POFFLINE_API_SPKI_PINS_MANDATORY=true` refuses any release-variant task with an empty pin set (task-graph `GradleException`), plus the `AndroidOfflineBuildConfiguration.enforcePins` runtime backstop. Debug/dev stays pin-optional. See `docs/security/CERTIFICATE-PINNING.md` (extraction, CI usage, rotation-with-overlap). **Residual: pins need release secrets discipline** — the repo default is still OFF, so a release pipeline that forgets the mandatory flag ships system-trust-only (pipeline checklist enforced in the doc). |
| `D-JS-AUTH` | **Remember-me SPA tokens in WebView DOM storage got no extra JS-side encryption.** `cms-access-token` / `cms-refresh-token` lived as raw localStorage rows inside the WebView's app-private sandbox; only the NATIVE token store was file-encrypted (`cms_native_session`). | **CLOSED** — PR #188 (merge `5755d20`), branch `feat/debt-d-js-auth-token-seal` | WebCrypto/Tink wrapping inside the SPA added key-management complexity for marginal gain while the WebView sandbox + D1 already bound the exposure. | Inside the shell, durable «تذكّرني» tokens are sealed via the origin-guarded bridge (`sealForLocalPersistence`/`unsealForLocalPersistence`, AndroidKeyStore AES-256-GCM, `v1:` envelopes) before any localStorage write; rotations re-seal; logout wipes the sealed material. No token getters — D1 surface unchanged (reflection test pins the 13-method allowlist). **Residual: the JS seal is shell-only** — plain browsers, pre-upgrade shells, and a failed seal keep the previous raw storage (best-effort by design); and the seal protects tokens at rest only, never against code already running in the allowlisted page (which holds the live session by definition). |
| `D-ABSURD` | **No product promise of absolute protection vs screenshots/recording/root.** `FLAG_SECURE` blocks screenshots/recents thumbnails only; it is not DRM. Temp decrypt-for-view exists (PDF/video/audio temp files deleted in `onDestroy`). | **CLOSED** — PR #189, branch `docs/debt-d-absurd-protection-limits` (this PR) | An absolute-promise claim would be technically false; honest Arabic-first messaging was chosen instead of an unenforceable marketing claim. | The policy is now formalized in `docs/security/PROTECTION-LIMITS.md` (Arabic + English): FLAG_SECURE purpose and limits; root/emulator/screen-recording/external-camera explicitly out of scope; encrypted-at-rest + session bind + server-side revoke documented as the enforceable architectural controls. A docs/UI copy sweep (student-web, admin-web, key docs) verified **no absolute overclaims exist to soften** — existing copy is scoped and honest (e.g. «الحماية من النسخ مفعّلة داخل المشغّل», `usePlayerProtection` "deterrent … NOT absolute protection"). **Residual: no absolute anti-exfil promise, ever** — this register is the standing rule for marketing/support copy. |

## Closure record — سجل الإغلاق

| Debt | Closed by | Merge SHA | Verification |
|---|---|---|---|
| `D-PIN` | PR #187 `feat/debt-d-pin-certificate-pinning` | `4338753feae66c1ba53d1723972ef44d0415a521` | `:app:testDebugUnitTest` 18 suites / 0 failures (incl. 6 new mandatory/optional-matrix tests); fail-closed gate verified: mandatory+empty+release task → `GradleException`, mandatory+empty+debug → passes, mandatory+pins+release → passes. |
| `D-JS-AUTH` | PR #188 `feat/debt-d-js-auth-token-seal` | `5755d20cec201cd7998d487fb8f934db0fd9306e` | `:app:testDebugUnitTest` green (`CmsJsBridgeTest` 13/13 incl. 13-method reflection allowlist with forbidden-token-getter assertions, `TokenSealEnvelopeTest` 5/5); student-web vitest 78 files / 776 tests green incl. 9 new seal cases; `tsc --noEmit` clean; keystore roundtrip/tamper instrumentation added to the CI connected suite. |
| `D-ABSURD` | PR #189 `docs/debt-d-absurd-protection-limits` | this PR | `docs/security/PROTECTION-LIMITS.md` added (AR+EN); copy sweep found zero overclaims (docs + student-web/admin-web UI). |

Original deferral rationale (audit trail, 2026-11-23): revisit `D-PIN` before any
public store listing; revisit `D-JS-AUTH` if the threat model changed (rooted
student fleet); never make the `D-ABSURD` claim. All three were revisited by the
2026-11-24 security-hardening program and closed as recorded above.
