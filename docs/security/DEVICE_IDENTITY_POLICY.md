# Device Identity Policy — Native Install Identity (Wave B)

**Status:** Active policy · **Scope:** Android shell + student-web + API device binding ·
**Related:** [android-shell-roadmap.md](../android-shell-roadmap.md) (Batches 0–4, D1) ·
[ANDROID_SECURITY_READINESS.md](security/ANDROID_SECURITY_READINESS.md)

## 1. Decision (Owner lock 2)

The product story for **device identity inside the Android shell** is the
**native/install identity** — a stable UUID generated and persisted by the Kotlin
shell in `EncryptedSharedPreferences` — **not** a "browser fingerprint". In plain
browsers (no shell), the web install id (`web-<32 hex>`) remains the identity.

## 2. What each surface uses (implemented, verified on main @ c701ad4)

| Surface | Identity | Implementation |
| --- | --- | --- |
| Android shell (native offline path) | Native install UUID | `InstallationIdProvider` + `EncryptedInstallationIdStore` — key `cms_installation_identity`/`installation_id`; same file/key as earlier builds so existing installs keep their id on upgrade. Sent as `X-Installation-Id` (and legacy `X-Device-Fingerprint`) by `OfflineRequestHeaders`. |
| Web inside the shell | **Native id wins** | `getOrCreateInstallationId()` (`apps/student-web/src/utils/index.ts`) feature-detects `window.CmsNative.getInstallationId()`; when the bridge supplies a valid id it is used for `X-Installation-Id` / `X-Device-Fingerprint` header parity — one identity per install, no second id created (asserted by `native-bridge.test.ts`). |
| Browser-only (no `CmsNative`) | Web install id | Opaque random `web-<32 hex>` in `localStorage` (`cms-device-fingerprint`); stable per browser profile; intentionally NOT a browser fingerprint (browser traits are not a reliable identity). |

Bridge surface (D1 unchanged): `window.CmsNative.getInstallationId()` is one of four
read-only bridge methods, origin-guarded by `ShellUrlPolicy` (empty string outside
the allowlisted HTTPS origin). No tokens — access or refresh — are ever injected
into JS.

## 3. API contract

`SessionService.CreateAsync`/`RotateAsync` bind sessions to the installation id
(`FixedTimeEquals` on rotation); student sessions additionally require an active
`DeviceBindings` row (`DeviceFingerprint == InstallationId`). Controllers read
`X-Installation-Id ?? X-Device-Fingerprint` (see `AuthController.Refresh`,
`FavoritesController`, `PracticeController`, …). Installation ids must be 16–200
chars (`ResolveInstallationAsync`).

## 4. Expected behaviors (not bugs)

- **Clear app data ⇒ new install id.** The id lives in `EncryptedSharedPreferences`;
  wiping app data regenerates it. This is expected.
- **Same student re-login after data clear must not be shown a fraud/scare
  message.** Verified on main: login (`LoginCommand`) auto-registers unknown
  installations via `ResolveInstallationAsync` (creates a `UserInstallation` row);
  `VerifyDeviceBindingAsync` for students registers/binds the new installation
  without revoking others, and the student-web UI carries **no** "new device /
  suspicious login" copy (grep verified: zero matches in `apps/student-web/src`).
  The student simply logs in again and a new device binding is created.
- **Uninstall/reinstall ⇒ new install id** (same reasoning — the encrypted store
  dies with the install).

## 5. No IMEI / hardware identifiers

The policy uses **no** IMEI, Android ID, serial, or any hardware identifier. No
compliant API is required because none is used. The identity is an opaque
per-install UUID — sufficient for session/device binding and revocation, and
privacy-minimal.

## 6. Test coverage (on main)

- `apps/android/.../InstallationIdProviderTest.kt` — generation, persistence,
  stable reads (JVM, no Robolectric).
- `apps/android/.../OfflineRequestHeadersTest.kt` — header injection contract.
- `apps/student-web/src/utils/native-bridge.test.ts` — bridge validation
  (malformed/oversized/non-string ids rejected), browser fallback when the
  bridge is absent or returns empty, and **native id priority inside the shell**
  (no web fallback id created).
- `apps/student-web/src/test/identity-installation.test.ts` — web install id
  stability + legacy malformed value replacement.

## 7. History note

The header fields keep the historical name `X-Device-Fingerprint` alongside
`X-Installation-Id` (API reads both). The word "fingerprint" is legacy naming
only — the value has always been an opaque random install id, never a
browser/hardware fingerprint. New code should prefer `X-Installation-Id`.
