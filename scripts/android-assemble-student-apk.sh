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

echo
echo "APK ready: $APK_PATH"
case "$APK_PATH" in
    *-unsigned.apk)
        echo "NOTE: this APK is UNSIGNED and will not install on a phone. Configure signing"
        echo "      (docs/android-signing-notes.md) and re-run with 'release'."
        ;;
esac
