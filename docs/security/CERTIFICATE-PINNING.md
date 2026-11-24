# Native Client Certificate Pinning — تثبيت شهادة الخادم للعملاء الأصليين

D-PIN closure (debt register, 2026-11-24). SPKI SHA-256 pinning for the native
HTTPS clients in the Android shell: **mandatory for store/release builds,
optional for debug/dev builds, fail-closed end to end.**

## What is pinned

Both native HTTPS clients in the app share one pin set (`BuildConfig.OFFLINE_API_SPKI_PINS_BASE64`):

| Client | File | Traffic |
|---|---|---|
| `HttpsOfflinePackageClient` | `security/HttpsOfflineClients.kt` | native session login/refresh, entitlements, offline package download/sync/status |
| `HttpsMediaContentTransport` | `media/MediaContentTransport.kt` | encrypted media cache downloads + entitlement re-checks |

Pinning runs **on top of** normal system CA validation (`PinnedTrustManager`:
system trust first, then the leaf SPKI pin must match). A pinned handshake with
a non-matching pin fails closed (`CertificateException`) — there is no
system-trust-only fallback while pins are configured.

**Out of scope:** the WebView itself (student-web SPA assets and its `fetch`
calls) uses system trust; pinning here covers the *native* clients only.
Pins are public hashes of the server public key — never secrets.

## The two gradle properties

| Property | Meaning | Default |
|---|---|---|
| `OFFLINE_API_SPKI_PINS_BASE64` | Comma-separated SPKI SHA-256 pins, each optionally prefixed `sha256/`. Malformed entries fail the build at configuration time. | `""` (pinning off) |
| `OFFLINE_API_SPKI_PINS_MANDATORY` | `true` = store/release mode. **Fail-closed:** with this flag on, any release-variant task (`assembleRelease`, `bundleRelease`, `lintVitalRelease`, `testReleaseUnitTest`, …) with an empty pin set aborts the build with a `GradleException` at task-graph time. | `false` |

Runtime backstop (for tampered or hand-wired configurations):
`AndroidOfflineBuildConfiguration.enforcePins` throws `IllegalStateException`
at first client use when mandatory pinning is compiled in but the pin set is
empty. `CmsApplication.apiCertificatePins` parses the set once and feeds both
clients.

| Build | Pins empty | Pins set |
|---|---|---|
| debug/dev, mandatory off (default) | system trust (current dev behavior) | pinning enforced |
| any build, mandatory on | **fails closed** (gradle release gate / runtime backstop) | pinning enforced |

## How to extract a pin (ops)

```bash
openssl s_client -connect api.example.com:443 </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | base64
```

Always pin at least **two** values: the current server key plus the
backup/next key (or the current pin of a second load-balanced endpoint). A
single-pin set turns every TLS key rotation into an app-store emergency.

## How to pass pins in release CI

```bash
./gradlew :app:assembleRelease \
  -POFFLINE_API_SPKI_PINS_MANDATORY=true \
  -POFFLINE_API_SPKI_PINS_BASE64="sha256/AAAA...,sha256/BBBB..." \
  -POFFLINE_TRUSTED_CLIENT_IMPLEMENTED=true \
  -POFFLINE_API_BASE_URL=https://<api-host> \
  -POFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64=<base64 SPKI> \
  -POFFLINE_KEYSTORE_ALIAS=cms.offline.package.key
```

Values can come from `-P` flags, CI environment variables, or a gitignored
`gradle.properties` — pins are public hashes, but keep them in CI variables so
the pin set is visible in one place. **Verification of fail-closed:** run the
command above with the mandatory flag but without the pins — the build must
refuse with `OFFLINE_API_SPKI_PINS_MANDATORY=true requires a non-empty
OFFLINE_API_SPKI_PINS_BASE64 pin set`.

## Key rotation (overlap procedure)

Certificate pinning fails closed — rotating the server key without an overlap
window bricks every installed client. Rotate like this:

1. **Prepare:** extract the pin of the NEW server key (procedure above) while
   the old key still serves traffic.
2. **Overlap set:** build and release with BOTH pins:
   `-POFFLINE_API_SPKI_PINS_BASE64="sha256/<old-pin>,sha256/<new-pin>"`.
   The overlap is only needed on the new release — already-shipped clients
   keep validating against the old pin, which is exactly why the server must
   not cut over before the overlap release is live.
3. **Cutover:** switch the server to the new key only after the overlap
   release has shipped and is in active use (account for forced-update lag).
4. **Cleanup:** the next app release may drop the old pin and keep
   `sha256/<new-pin>` + the pin of the NEXT backup key.

If the API host is served by multiple certificates/load balancers, every
currently-served public key must be in the set at all times.

## Checklist (release pipeline)

- [ ] Pin set contains ≥ 2 pins (current + backup/next key).
- [ ] Every served certificate's public key for the API host is in the set.
- [ ] `OFFLINE_API_SPKI_PINS_MANDATORY=true` in the store/release pipeline.
- [ ] Fail-closed verified once per pipeline: mandatory + empty pins → build refuses.
- [ ] Key rotation calendar includes the overlap procedure above.
- [ ] Debug builds stay pin-optional (developers on placeholder domains).

## Where the code lives

- `security/OfflineCertificatePinning.kt` — parse + `PinnedTrustManager`.
- `security/AndroidOfflineBuildConfiguration.kt` — `enforcePins` runtime backstop.
- `apps/android/app/build.gradle.kts` — property parsing, `BuildConfig` fields,
  release task-graph fail-closed gate.
- `CmsApplication.kt` — single parsed pin set shared by both native clients.
- Tests: `AndroidOfflineBuildConfigurationTest` (mandatory/optional matrix),
  `OfflineCertificatePinningTest` (parse, empty vs non-empty, mismatch fails
  the handshake trust decision).
