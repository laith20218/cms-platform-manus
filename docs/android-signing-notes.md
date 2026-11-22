# Android Signing Notes — CMS Student App (`apps/android`)

Audience: whoever assembles the **release** APK for the student pilot.
Scope: **local signing for sideload distribution only**. Google Play listing and
Play App Signing are future work and explicitly out of scope for the pilot.

## 1. Background

- **Debug builds** are signed automatically with the per-machine debug keystore
  (`~/.android/debug.keystore`, auto-generated). A `debug` APK installs on any
  phone immediately — fine for first pilot smoke tests.
- **Release builds** are not signed by default. Without signing configuration you
  get `app-release-unsigned.apk`, which Android refuses to install.
- Signing material lives **outside this repository**. The repo contains only:
  - `apps/android/keystore.properties.example` — placeholder template, committed;
  - the Gradle wiring in `apps/android/app/build.gradle.kts` that reads your
    **local, gitignored** `keystore.properties` (or environment variables).

## 2. Generate a local release keystore (OUTSIDE the repo)

`keytool` ships with the JDK (17+). Run this outside the repository, in a private
location you back up:

```bash
mkdir -p ~/keystores
keytool -genkeypair -v \
  -keystore ~/keystores/cms-student-upload.jks \
  -alias cms-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

- Choose strong store/key passwords and store them in a password manager.
- **Password caveat (verified locally):** modern JDKs default to the PKCS12
  keystore format, which does **not** support different store and key passwords —
  a distinct `-keypass` is silently replaced by the store password, and the
  release build then fails with
  `KeytoolException: ... Given final block not properly padded`. Either use the
  **same password for store and key** (recommended, simplest), or generate with
  `-storetype JKS` if you truly need separate passwords.
- Keep an offline backup. **Losing the keystore means you can never ship an
  update** over the already-installed pilot APK (students would have to
  uninstall first).
- Never move the `.jks` into the repository. `.gitignore` blocks
  `*.jks`, `*.keystore`, `*.p12`, `*.pfx` and `keystore.properties` as a second
  line of defense.

## 3. Point Gradle at it — Option A: `keystore.properties` (recommended)

```bash
cd apps/android
cp keystore.properties.example keystore.properties
# then edit keystore.properties:
#   storeFile=/absolute/path/outside/repo/cms-student-upload.jks
#   storePassword=...  keyAlias=...  keyPassword=...
```

- The real `keystore.properties` is **gitignored**. Verify after creating it:
  `git check-ignore -v apps/android/keystore.properties` (it should print a rule).
- `storeFile`: an absolute path is recommended; a relative path resolves from
  `apps/android/`.
- When the file exists it **takes precedence** over the environment variables.
- Fail-fast: if the file exists but any of the four keys is missing or blank,
  every Gradle invocation stops immediately with a clear error (a half-configured
  signing setup must never silently produce an unsigned release).
- If `storeFile` points at a file that does not exist, the build also fails fast
  with the resolved path in the message.

## 4. Point Gradle at it — Option B: environment variables

Used only when `apps/android/keystore.properties` is absent. All four are
required together:

```bash
export CMS_STORE_FILE=/absolute/path/outside/repo/cms-student-upload.jks
export CMS_STORE_PASSWORD=...
export CMS_KEY_ALIAS=cms-upload
export CMS_KEY_PASSWORD=...
```

This shape maps directly to CI secrets later (repository secrets → environment
variables), which keeps actual values out of every file. Do not put the values
in scripts, docs, or PR descriptions.

## 5. Build and verify a signed release

```bash
cd apps/android && ./gradlew :app:assembleRelease \
  -PSTUDENT_WEB_BASE_URL=https://student.your-domain.com \
  -PAPI_BASE_URL=https://api.your-domain.com
```

- Signed output: `app/build/outputs/apk/release/app-release.apk`
- No signing config present: `app/build/outputs/apk/release/app-release-unsigned.apk`
  (the pre-existing behavior, unchanged).

Verify the APK is actually signed with your key:

```bash
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --print-certs \
  app/build/outputs/apk/release/app-release.apk
```

(The `apksigner` path assumes build-tools 35.0.0; adjust if you installed a
different revision. `keytool -printcert -jarfile <apk>` also works.)

## 6. Committed vs. ignored — current state

| Path | Committed? | Why |
|---|---|---|
| `apps/android/keystore.properties.example` | yes | placeholders only (`CHANGE_ME`) |
| `apps/android/keystore.properties` | **no** — gitignored | your real local values |
| `*.jks`, `*.keystore`, `*.p12`, `*.pfx` | **no** — gitignored | keystore binaries |
| `apps/android/local.properties` | **no** — gitignored | machine-local SDK path |
| `apps/android/.gradle/`, `**/build/` | **no** — gitignored | build outputs/caches |

CI note: `.github/workflows/android-offline-runtime.yml` builds **debug** APKs
only and receives no signing configuration — no keystore material ever enters CI
today. Wiring release signing into CI (via repository secrets) is future work.

## 7. Safety and rotation

- Never share the keystore file or its passwords. Anyone holding them can ship a
  malicious APK that installs as an update over your students' app.
- If the keystore leaks: generate a **new** keystore, build and redistribute the
  release with it, and tell students to uninstall the old app first (different
  signature = no in-place update).
- Never commit passwords or keystores anywhere — including docs, comments, code
  reviews, CI logs, or PR descriptions. The tree-wide secret scan in CI
  (`ci.yml` → security-gate) is the last net, not the first.

## 8. Related

- Student-facing build & install walkthrough (Arabic): `docs/android-student-apk-guide.md`
- Shell architecture and batches 0–4: `docs/android-shell-roadmap.md`
