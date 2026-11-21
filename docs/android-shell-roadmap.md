# Android Shell Roadmap — Batch 0 & Batch 1

Hybrid WebView shell for the student experience. Kotlin stays the platform:
`apps/android` owns device security, while `apps/student-web` owns the UI it hosts.

## Locked decisions

| # | Decision |
|---|----------|
| 1 | Client stays Kotlin. No C# / no MAUI Android rewrite. |
| 2 | Hybrid architecture: a WebView shell hosts student-web; Kotlin owns device security, later cache/push. |
| 3 | `ShellActivity` (new) is the LAUNCHER for normal use. No dual login session paths in this wave. |
| 4 | `MainActivity` (current phone/password offline entry) keeps the offline package flow but loses its LAUNCHER intent-filter in Batch 1. Rename can happen later. |
| 5 | No full media cache, FCM, or Matching UI in this wave. |

## Recon snapshot (Batch 0)

- Project: `apps/android`, single module `:app`, `applicationId com.cms.student`, `versionName 0.1.0`.
- Toolchain: AGP **8.7.3**, Kotlin **2.0.21**, Gradle wrapper **8.9** (bin), JDK 17 bytecode / JDK 21 in CI, `compileSdk 35`, `targetSdk 35`, `minSdk 26`.
- Build: `cd apps/android && ./gradlew :app:assembleDebug` (needs JDK 17+ and `ANDROID_HOME` or `local.properties` `sdk.dir`). Unit tests: `./gradlew :app:testDebugUnitTest`. Instrumentation: `./gradlew :app:connectedDebugAndroidTest`.
- CI: `.github/workflows/android-offline-runtime.yml` runs `:app:assembleDebug :app:assembleDebugAndroidTest` plus API 35 connected instrumentation on every PR touching `apps/android/**`; the monorepo `ci.yml` adds a tree-wide secret scan.
- Security baseline preserved: `android:allowBackup="false"`, `android:usesCleartextTraffic="false"`, `network_security_config.xml` (cleartext denied), and the `com.cms.student.security.*` offline core with all its unit/instrumentation tests untouched.

## Build configuration keys (public config only — never secrets)

| BuildConfig key | Default | Purpose |
|---|---|---|
| `STUDENT_WEB_BASE_URL` | `https://app.cms.example.com` | HTTPS origin the shell WebView loads (Batch 1). Placeholder documented domain (see `deploy/`) until DNS go-live. |
| `API_BASE_URL` | `https://api.cms.example.com` | Reserved for later online flows; not consumed by client code yet. |
| `OFFLINE_API_BASE_URL` | `""` (unchanged) | Existing offline transport base; release pipeline injects. |
| `OFFLINE_TRUSTED_CLIENT_IMPLEMENTED` | `false` (unchanged) | Trusted offline stays disabled without release injection. |
| `OFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64` | `""` (unchanged) | Public verification key; never a private key in-repo. |
| `OFFLINE_KEYSTORE_ALIAS` | `cms.offline.package.key` (unchanged) | Android Keystore alias for the offline package key. |

Per-build override:

```bash
./gradlew :app:assembleDebug -PSTUDENT_WEB_BASE_URL=https://<student-web-host> -PAPI_BASE_URL=https://<api-host>
```

Both properties are validated at configuration time: absolute HTTPS only, no
quotes/backslashes. The build fails fast on anything else, so a non-HTTPS shell
URL cannot be produced by accident.

## Batch 0 — done criteria (status: DONE)

- [x] `apps/android` opens as a standard Gradle Android app; `:app:assembleDebug` green (local evidence recorded in the PR; CI re-runs it on every PR).
- [x] `STUDENT_WEB_BASE_URL` / `API_BASE_URL` BuildConfig fields added with HTTPS-only validation; all `OFFLINE_*` fields unchanged; no private keys in repo.
- [x] `android:allowBackup="false"` preserved; security core and its tests untouched.
- [x] This roadmap documents Batch 0–1 done criteria and the MainActivity launcher decision.

## Batch 1 — done criteria (status: DONE)

Delivered in `feat/android-batch-1-webview-shell`:

- [x] `shell/ShellActivity` is `MAIN`/`LAUNCHER`, sets `FLAG_SECURE`, hosts the WebView through `shell/WebViewHost`. Verified in the built APK: `MainActivity` has `exported=false` and no intent-filter; `ShellActivity` carries `exported=true` + the LAUNCHER filter.
- [x] WebView host checklist (all in `shell/WebViewHost.kt`): HTTPS-only load of `STUDENT_WEB_BASE_URL`; `shouldOverrideUrlLoading` in **both** overloads delegates to `shell/ShellUrlPolicy` which allowlists exactly the configured host (+ explicit port when the base URL carries one) and rejects non-HTTPS schemes, other hosts/subdomains, embedded credentials, and odd ports; no address bar / no external browser — blocked navigations are dropped silently; `setSavePassword(false)`; DOM storage **enabled** (student-web session storage requires it — evidence: `apps/student-web/src/app/providers/AuthProvider.tsx`, `src/services/api-client.ts` use `localStorage`/`sessionStorage`); `setAllowFileAccess(false)` + `allowContentAccess(false)` + both `*FromFileURLs` settings false; geolocation off; multiple windows off; mixed content never allowed; TLS errors fail closed (`handler.cancel()`); JS enabled; **no** `@JavascriptInterface` bridge anywhere.
- [x] `session/InstallationIdProvider` + `session/EncryptedInstallationIdStore`: stable UUID per install in `EncryptedSharedPreferences`, same file/key as the previous `CmsApplication` identity (`cms_installation_identity`/`installation_id`) so existing installs keep their id on upgrade. `CmsApplication.installationIdProvider()` exposes the read API for later `X-Installation-Id` header injection; not exposed to JS.
- [x] `MainActivity` lost its LAUNCHER intent-filter and is `exported="false"`; the offline entry stays reachable via explicit intent, e.g. `adb shell am start -n com.cms.student/.MainActivity`. The existing instrumentation suites launch it explicitly (`ActivityScenario.launch`), so they are unaffected.
- [x] Arabic-first error UI (`res/values/strings.xml` default Arabic, `values-en/` English fallback) for a missing/invalid URL (configuration error) and main-frame network/HTTP failures — honest messaging, no fake offline mode. Retry button reloads the configured home.
- [x] JVM unit tests: `ShellUrlPolicyTest` (8) + `InstallationIdProviderTest` (5) — pure logic, no Robolectric (the project does not use it). Existing security suites unchanged and green (27 total).

Notes: `android:label="CMS"` added to the application (matches the student-web PWA `short_name`); previously the launcher showed the raw package name. Out-of-scope items below remain untouched.

### Out of scope (later batches)

- Batch 2+: session token wiring into requests, optional certificate pinning.
- Batch 3: JS bridge (`@JavascriptInterface`) for native ↔ web calls.
- Later: encrypted media cache, FCM push, Play Integrity activation, Matching UI.
