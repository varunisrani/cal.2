#!/usr/bin/env bash
# Builds the Platewise Android app: the web build, `cap sync` into android/, then Gradle.
#
#   pnpm android:apk              debug APK  -> android/app/build/outputs/apk/debug/app-debug.apk
#   pnpm android:apk --release    release APK (signed when the four signing variables are set)
#
# Needs: the Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT, or sdk.dir in android/local.properties)
# with platform android-36, and JDK 21 or newer.
#
# Environment:
#   PLATEWISE_BUILD_NUMBER   the APK's versionCode (default 1); versionName is package.json's version
#   PLATEWISE_MAVEN_MIRROR   set it where Maven Central refuses or throttles requests: "1" uses
#                            Google's mirror of Maven Central, an https:// address uses that one
#                            (scripts/android/mirror.init.gradle)
#   PLATEWISE_KEYSTORE, PLATEWISE_KEYSTORE_PASSWORD, PLATEWISE_KEY_ALIAS, PLATEWISE_KEY_PASSWORD
#                            release signing (all four or none); never stored in the repository
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

variant=debug
for arg in "$@"; do
  case "$arg" in
    --release) variant=release ;;
    --debug) variant=debug ;;
    -h | --help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "build-apk: unknown option $arg (use --release or --debug)" >&2
      exit 2
      ;;
  esac
done

fail() {
  echo "build-apk: $*" >&2
  exit 2
}

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]] && ! grep -qs '^sdk.dir=' android/local.properties; then
  fail "no Android SDK: set ANDROID_HOME (or ANDROID_SDK_ROOT, or sdk.dir in android/local.properties)"
fi

java_major="$(java -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.specification.version = //p')"
if [[ -z "$java_major" ]]; then
  fail "no java on PATH: install JDK 21 or newer (or set JAVA_HOME and PATH)"
fi
if ((java_major < 21)); then
  fail "JDK $java_major found; Capacitor 7 needs JDK 21 or newer"
fi

gradle_args=(--console=plain)
if [[ -n "${PLATEWISE_MAVEN_MIRROR:-}" ]]; then
  gradle_args+=(--init-script "$root/scripts/android/mirror.init.gradle")
fi

echo "build-apk: web build"
pnpm build

echo "build-apk: copying the web build into android/"
pnpm exec cap sync android

task="assemble${variant^}"
echo "build-apk: gradle $task"
(cd android && ./gradlew "${gradle_args[@]}" "$task")

out_dir="android/app/build/outputs/apk/$variant"
apk="$(ls -t "$out_dir"/*.apk 2>/dev/null | head -n 1 || true)"
if [[ -z "$apk" ]]; then
  fail "Gradle finished but no APK is in $out_dir"
fi
echo "build-apk: $apk ($(du -h "$apk" | cut -f1))"
