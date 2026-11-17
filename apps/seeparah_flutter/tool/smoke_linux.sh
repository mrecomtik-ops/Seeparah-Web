#!/usr/bin/env bash
# CI smoke validation, not a substitute for testing actual Linux computers.
set -euo pipefail
cd "$(dirname "$0")/.."
version="$(sed -nE 's/^version: ([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' pubspec.yaml)"
: "${version:?No valid Flutter app version}"
deb="dist/linux/Seeparah-${version}-Linux-amd64.deb"
appimage="dist/linux/Seeparah-${version}-Linux-x86_64.AppImage"
test -s "$deb"
test -s "$appimage"
dpkg-deb --contents "$deb" | grep -Fq 'usr/lib/seeparah/seeparah_reader'
dpkg-deb --contents "$deb" | grep -Fq 'usr/share/applications/com.seeparah.reader.desktop'
chmod +x "$appimage"

# Run the real Flutter app in a virtual desktop; if it exits/crashes before
# the timeout, fail unless the process exited with code zero.
smoke() {
  local label="$1"
  shift
  set +e
  timeout --preserve-status -s TERM 8s xvfb-run -a "$@" > "$RUNNER_TEMP/seeparah-${label}.log" 2>&1
  local status=$?
  set -e
  # timeout --preserve-status can use the signal status (143), whereas an
  # immediate nonzero exit indicates native runtime or dependency failure.
  if [[ "$status" != "0" && "$status" != "143" && "$status" != "124" ]]; then
    tail -n 60 "$RUNNER_TEMP/seeparah-${label}.log"
    echo "Linux ${label} smoke startup failed with status ${status}" >&2
    exit 1
  fi
}

sudo dpkg -i "$deb"
test -x /usr/lib/seeparah/seeparah_reader
test -x /usr/bin/seeparah
smoke deb /usr/bin/seeparah

APPIMAGE_EXTRACT_AND_RUN=1 smoke appimage "./$appimage"

sudo dpkg -r seeparah
if dpkg-query -W -f='${Status}' seeparah 2>/dev/null | grep -q '^install ok installed$'; then
  echo "Seeparah .deb uninstall did not remove installed package" >&2
  exit 1
fi
sha256sum "$deb" "$appimage"
echo "Linux deb and AppImage CI smoke checks passed"
