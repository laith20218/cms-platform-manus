#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# android-assemble-student-apk.sh — thin helper for the CMS student pilot APK.
#
# Assembles the Android app (apps/android, com.cms.student) with explicit
# HTTPS base URLs and prints the resulting APK path.
#
# Usage (from the repository root, or any directory):
#   scripts/android-assemble-student-apk.sh <STUDENT_WEB_BASE_URL> <API_BASE_URL> [debug|release]
#
# Example:
#   scripts/android-assemble-student-apk.sh https://student.your-domain.com https://api.your-domain.com debug
#
# Notes:
#   - Both URLs must be absolute HTTPS (the Gradle build re-validates this too).
#   - Requires JDK 17+ and an Android SDK (ANDROID_HOME or
#     apps/android/local.properties with sdk.dir=...). Gradle itself comes from
#     the repo's wrapper.
#   - Release signing is NOT handled here: it comes from your gitignored
#     apps/android/keystore.properties or CMS_* environment variables.
#     See docs/android-signing-notes.md. No secrets live in this script.
# ---------------------------------------------------------------------------
set -euo pipefail

usage() {
    echo "Usage: $0 <STUDENT_WEB_BASE_URL> <API_BASE_URL> [debug|release]" >&2
    echo "Example: $0 https://student.your-domain.com https://api.your-domain.com debug" >&2
}

if [ "$#" -ne 2 ] && [ "$#" -ne 3 ]; then
    usage
    exit 2
fi

STUDENT_WEB_BASE_URL="$1"
API_BASE_URL="$2"
BUILD_TYPE="${3:-debug}"

check_https() {
    local name="$1" url="$2"
    case "$url" in
        https://*) ;;
        *) echo "ERROR: $name must be an absolute HTTPS URL (got: '$url')" >&2; exit 2 ;;
    esac
    case "$url" in
        *'"'*|*'\'*) echo "ERROR: $name must not contain quotes or backslashes" >&2; exit 2 ;;
    esac
}

check_https STUDENT_WEB_BASE_URL "$STUDENT_WEB_BASE_URL"
check_https API_BASE_URL "$API_BASE_URL"

case "$BUILD_TYPE" in
    debug)   GRADLE_TASK=":app:assembleDebug" ;;
    release) GRADLE_TASK=":app:assembleRelease" ;;
    *) echo "ERROR: build type must be 'debug' or 'release' (got: '$BUILD_TYPE')" >&2; usage; exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/android"

echo "Building $BUILD_TYPE APK"
echo "  STUDENT_WEB_BASE_URL=$STUDENT_WEB_BASE_URL"
echo "  API_BASE_URL=$API_BASE_URL"
echo

./gradlew "$GRADLE_TASK" \
    -PSTUDENT_WEB_BASE_URL="$STUDENT_WEB_BASE_URL" \
    -PAPI_BASE_URL="$API_BASE_URL"

APK_DIR="app/build/outputs/apk/$BUILD_TYPE"
APK_PATH=""
for candidate in "$APK_DIR/app-$BUILD_TYPE.apk" "$APK_DIR"/*.apk; do
    if [ -f "$candidate" ]; then
        APK_PATH="$candidate"
        break
    fi
done

if [ -z "$APK_PATH" ]; then
    echo "ERROR: no APK found under $APK_DIR — check the Gradle output above." >&2
    exit 1
fi

# RC1 — identify the artifact so a build can never ship mislabeled: applicationId +
# versionName/versionCode are read from the app build script, and when aapt is
# reachable (ANDROID_HOME or apps/android/local.properties sdk.dir=...) the values
# are VERIFIED against the built APK itself (dump badging).
APP_GRADLE="$REPO_ROOT/apps/android/app/build.gradle.kts"
APP_ID="$(sed -nE 's/^[[:space:]]*applicationId = "([^"]+)".*/\1/p' "$APP_GRADLE" | head -1)"
VERSION_NAME="$(sed -nE 's/^[[:space:]]*versionName = "([^"]+)".*/\1/p' "$APP_GRADLE" | head -1)"
VERSION_CODE="$(sed -nE 's/^[[:space:]]*versionCode = ([0-9]+).*/\1/p' "$APP_GRADLE" | head -1)"
echo
echo "Identity: applicationId=${APP_ID:-?} versionName=${VERSION_NAME:-?} versionCode=${VERSION_CODE:-?}"

SDK_DIR="${ANDROID_HOME:-}"
if [ -z "$SDK_DIR" ] && [ -f "$REPO_ROOT/apps/android/local.properties" ]; then
    SDK_DIR="$(sed -nE 's/^sdk\.dir=(.*)$/\1/p' "$REPO_ROOT/apps/android/local.properties" | head -1)"
fi
AAPT=""
if [ -n "$SDK_DIR" ] && [ -d "$SDK_DIR/build-tools" ]; then
    AAPT="$(ls "$SDK_DIR"/build-tools/*/aapt 2>/dev/null | sort -V | tail -1)"
fi
if [ -n "$AAPT" ] && [ -x "$AAPT" ]; then
    BADGING="$("$AAPT" dump badging "$APK_PATH" 2>/dev/null | sed -n '1p')"
    echo "Verified (aapt): $BADGING"
    if [ -n "$APP_ID" ] && [ -n "$BADGING" ] && ! printf '%s' "$BADGING" | grep -q "name='$APP_ID'"; then
        echo "WARNING: the APK's packaged applicationId does not match $APP_ID — do not distribute this build." >&2
    fi
else
    echo "Note: aapt not found — identity above is from build.gradle.kts (not verified against the APK)."
fi

echo
echo "APK ready: $APK_PATH"
case "$APK_PATH" in
    *-unsigned.apk)
        echo "NOTE: this APK is UNSIGNED and will not install on a phone. Configure signing"
        echo "      (docs/android-signing-notes.md) and re-run with 'release'."
        ;;
esac
