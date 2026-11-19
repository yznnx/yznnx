#!/usr/bin/env bash
# Builds "Study Vault.app" for Macs with Apple chips (M1–M4) and zips it.
#   npm run build:mac            → desktop/out/Study-Vault-mac-arm64.zip
#   ARCH=x64 npm run build:mac   → Intel Macs
# The app is the official, unmodified Electron runtime plus Study Vault in
# Contents/Resources/app. It is not signed with an Apple Developer ID, so macOS
# asks for confirmation the first time (see README).
set -euo pipefail
cd "$(dirname "$0")/.."

ELECTRON_VERSION=$(node -p "require('electron/package.json').version")
ARCH=${ARCH:-arm64}
CACHE=desktop/.cache
OUT=desktop/out
ZIP="electron-v$ELECTRON_VERSION-darwin-$ARCH.zip"
BASE="https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION"

mkdir -p "$CACHE"
if [ ! -f "$CACHE/$ZIP" ]; then
  echo "Downloading $ZIP …"
  curl -fsSL -o "$CACHE/$ZIP.part" "$BASE/$ZIP"
  curl -fsSL -o "$CACHE/SHASUMS256-$ELECTRON_VERSION.txt" "$BASE/SHASUMS256.txt"
  expected=$(grep " \*$ZIP\$" "$CACHE/SHASUMS256-$ELECTRON_VERSION.txt" | cut -d' ' -f1)
  actual=$(sha256sum "$CACHE/$ZIP.part" | cut -d' ' -f1)
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    echo "Checksum mismatch for $ZIP" >&2
    rm -f "$CACHE/$ZIP.part"
    exit 1
  fi
  mv "$CACHE/$ZIP.part" "$CACHE/$ZIP"
  echo "Checksum OK ($actual)"
fi

[ "${SKIP_BUILD:-}" = 1 ] || npm run build

rm -rf "$OUT" && mkdir -p "$OUT/tmp"
unzip -q "$CACHE/$ZIP" -d "$OUT/tmp"
mv "$OUT/tmp/Electron.app" "$OUT/Study Vault.app"
rm -rf "$OUT/tmp"
RES="$OUT/Study Vault.app/Contents/Resources"
mkdir "$RES/app"
cp desktop/main.cjs desktop/package.json "$RES/app/"
cp StudyApp.html "$RES/app/index.html"
cp desktop/icon.icns "$RES/electron.icns"

(cd "$OUT" && zip -qry -9 "Study-Vault-mac-$ARCH.zip" "Study Vault.app")
ls -lh "$OUT/Study-Vault-mac-$ARCH.zip"
