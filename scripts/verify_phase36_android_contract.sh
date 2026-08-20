#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
export DOTNET_ROLL_FORWARD=Major
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/home/ubuntu/android-sdk}"

# The generated fixture has test-only keys and belongs only under Android test resources.
dotnet run --project "$root/tools/Phase36ContractVector/Phase36ContractVector.csproj" -- \
  "$root/apps/android/app/src/test/resources/phase36-contract-vector.json"

(
  cd "$root/apps/android"
  GRADLE_OPTS='-Xmx768m -Dfile.encoding=UTF-8' \
    ./gradlew --no-daemon testDebugUnitTest
)
