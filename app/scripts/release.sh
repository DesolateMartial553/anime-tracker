#!/usr/bin/env bash
# Builds and verifies a signed Cozy Corner APK.
# Usage: app/scripts/release.sh <versionName> <versionCode>      e.g. 2.8.1 21
#
# What it does, in order (stops on the first failure):
#   1. sets versionName/versionCode in android/app/build.gradle and version.json
#   2. npm run sync            (copies the site into app/www, then into the Android assets)
#   3. ./gradlew assembleRelease
#   4. copies the signed APK to app/dist/CozyCorner.apk
#   5. verifies the APK itself (byte-identical site files, no explore, right versionCode/Name)
#
# It never pushes, tags or publishes anything. Publishing is a separate, manual step.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <versionName> <versionCode>   (e.g. $0 2.8.1 21)" >&2
  exit 2
fi

VERSION_NAME="$1"
VERSION_CODE="$2"

case "$VERSION_NAME" in
  ''|*[!0-9.]*) echo "versionName must look like 2.8.1 (got '$VERSION_NAME')" >&2; exit 2 ;;
esac
case "$VERSION_CODE" in
  ''|*[!0-9]*) echo "versionCode must be a whole number (got '$VERSION_CODE')" >&2; exit 2 ;;
esac

SCRIPTS=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP=$(dirname "$SCRIPTS")          # app/
ROOT=$(dirname "$APP")             # repo root
GRADLE_FILE="$APP/android/app/build.gradle"
VERSION_JSON="$ROOT/version.json"
DIST="$APP/dist"
DIST_APK="$DIST/CozyCorner.apk"
RELEASE_APK="$APP/android/app/build/outputs/apk/release/app-release.apk"
APK_URL="https://github.com/DesolateMartial553/anime-tracker/releases/latest/download/CozyCorner.apk"

# Gradle 8.14 does not run on this machine's default JDK 27; the project is known-good on JDK 21.
if [ -z "${JAVA_HOME:-}" ] && [ -d /usr/lib/jvm/java-21-openjdk ]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
fi

step() { printf '\n==> %s\n' "$*"; }

step "1/5 version $VERSION_NAME ($VERSION_CODE)"
sed -i -E "s/^([[:space:]]*versionCode[[:space:]]+)[0-9]+[[:space:]]*$/\1${VERSION_CODE}/" "$GRADLE_FILE"
sed -i -E "s/^([[:space:]]*versionName[[:space:]]+)\"[^\"]*\"[[:space:]]*$/\1\"${VERSION_NAME}\"/" "$GRADLE_FILE"

grep -qE "^[[:space:]]*versionCode[[:space:]]+${VERSION_CODE}[[:space:]]*$" "$GRADLE_FILE" \
  || { echo "FAILED to set versionCode in $GRADLE_FILE" >&2; exit 1; }
grep -qE "^[[:space:]]*versionName[[:space:]]+\"${VERSION_NAME}\"[[:space:]]*$" "$GRADLE_FILE" \
  || { echo "FAILED to set versionName in $GRADLE_FILE" >&2; exit 1; }

cat > "$VERSION_JSON" <<JSON
{
  "versionCode": ${VERSION_CODE},
  "versionName": "${VERSION_NAME}",
  "apk": "${APK_URL}",
  "notes": "v${VERSION_NAME}: rebuilt from the live site, release pipeline added."
}
JSON
echo "build.gradle + version.json set:"
grep -nE 'versionCode|versionName' "$GRADLE_FILE"
cat "$VERSION_JSON"

step "2/5 npm run sync"
cd "$APP"
npm run sync

step "3/5 gradlew assembleRelease"
cd "$APP/android"
./gradlew assembleRelease

step "4/5 copy the signed APK to app/dist"
[ -f "$RELEASE_APK" ] || { echo "no APK at $RELEASE_APK" >&2; exit 1; }
mkdir -p "$DIST"
cp "$RELEASE_APK" "$DIST_APK"
grep -qxF 'app/dist/' "$ROOT/.gitignore" || printf 'app/dist/\n' >> "$ROOT/.gitignore"

step "5/5 verify the APK itself"
cd "$ROOT"
fail() { echo "VERIFY FAILED: $*" >&2; exit 1; }

unzip -p "$DIST_APK" assets/public/index.html | cmp - index.html \
  || fail "APK's assets/public/index.html is not byte-identical to index.html"
echo "ok  assets/public/index.html == index.html"

unzip -p "$DIST_APK" assets/public/js/app.js | cmp - js/app.js \
  || fail "APK's assets/public/js/app.js is not byte-identical to js/app.js"
echo "ok  assets/public/js/app.js == js/app.js"

EXPLORE_HITS=$(unzip -p "$DIST_APK" assets/public/index.html assets/public/js/app.js | grep -ci explore || true)
[ "$EXPLORE_HITS" = "0" ] || fail "the APK still mentions 'explore' $EXPLORE_HITS time(s)"
echo "ok  no 'explore' anywhere in the APK's html/js"

AAPT2=""
for bt in 36.0.0 35.0.0 34.0.0; do
  if [ -x "$HOME/Android/Sdk/build-tools/$bt/aapt2" ]; then AAPT2="$HOME/Android/Sdk/build-tools/$bt/aapt2"; break; fi
done
[ -n "$AAPT2" ] || AAPT2=$(command -v aapt2 || true)
[ -n "$AAPT2" ] || fail "aapt2 not found (looked in ~/Android/Sdk/build-tools)"
echo "using $AAPT2"

BADGING=$("$AAPT2" dump badging "$DIST_APK")
GOT_CODE=$(printf '%s\n' "$BADGING" | sed -n "s/^package:.*versionCode='\([0-9]*\)'.*/\1/p")
GOT_NAME=$(printf '%s\n' "$BADGING" | sed -n "s/^package:.*versionName='\([^']*\)'.*/\1/p")
[ "$GOT_CODE" = "$VERSION_CODE" ] || fail "APK versionCode is '$GOT_CODE', expected '$VERSION_CODE'"
[ "$GOT_NAME" = "$VERSION_NAME" ] || fail "APK versionName is '$GOT_NAME', expected '$VERSION_NAME'"
echo "ok  APK reports versionCode=$GOT_CODE versionName=$GOT_NAME"

ls -l --time-style=full-iso "$DIST_APK"
sha256sum "$DIST_APK"

printf '\nBUILT AND VERIFIED: %s (versionCode %s)\n' "$VERSION_NAME" "$VERSION_CODE"
echo "Nothing has been pushed, tagged or released."
