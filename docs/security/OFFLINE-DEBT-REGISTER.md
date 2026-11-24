# Offline Engineering Debt Register — سجل الديون الهندسية

Created at the close of the offline program (Owner decisions 2026-11-23; PRs
#182–#186). Each item is a deliberate, accepted deferral — recorded here so it
cannot be forgotten, with a one-line reason and the state it leaves the product in.
Status: **OPEN** unless flipped here with the Owner's sign-off.

| ID | Debt | Status | Why it was deferred (one line) | What this leaves the product with |
|---|---|---|---|---|
| `D-PIN` | **Certificate pinning is not mandatory for store builds.** `OFFLINE_API_SPKI_PINS_BASE64` defaults to empty (`OfflineCertificatePinning.parsePins("")` → no pinning; transport falls back to system trust + HTTPS-only). The plumbing is complete and fail-closed once pins are provided via `-P`. | OPEN | Pin setup needs the release team's real SPKIs and a rotation plan — forcing it now with placeholder pins would brick pilot builds; the enforcement point is one gradle flag away. | HTTPS + system trust store; a MITM with a trusted CA can read/alter native offline traffic. |
| `D-JS-AUTH` | **Remember-me SPA tokens in WebView DOM storage get no extra JS-side encryption.** `cms-access-token` / `cms-refresh-token` live in localStorage/sessionStorage inside the WebView's app-private sandbox; only the NATIVE token store is file-encrypted (`cms_native_session`). | OPEN | WebCrypto/Tink wrapping adds key-management complexity inside the SPA for a marginal gain while the WebView sandbox + D1 (no token crossing the bridge) already bound the exposure; deferred as an Owner-level UX/security tradeoff. | App-sandbox-protected plaintext tokens in DOM storage; a root device or a shell-allowlisted XSS could read them (XSS surface is tightly audited via `ShellUrlPolicy` + the closed `CmsNative` bridge). |
| `D-ABSURD` | **No product promise of absolute protection vs screenshots/recording/root.** `FLAG_SECURE` blocks screenshots/recents thumbnails only; it is not DRM. Temp decrypt-for-view exists (PDF/video/audio temp files deleted in `onDestroy`). | OPEN | An absolute-promise claim would be technically false; honest Arabic-first messaging (docs §Residual risks, panel copy) was chosen instead of an unenforceable marketing claim. | Documented, honest limits: root users can dump memory/backup app data; screen recording on some ROMs is possible; no Widevine/DRM in this program. |

Deferred-with-eyes-open by the Owner program brief. Revisit `D-PIN` before any
public store listing; revisit `D-JS-AUTH` if the threat model changes (rooted
student fleet); never make the `D-ABSURD` claim.
