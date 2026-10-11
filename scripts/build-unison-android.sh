#!/usr/bin/env bash
# Builds static arm64 binaries of unison and the noussh helper, and drops them
# into jniLibs so Android extracts them to the (executable) native lib dir.
#
# Needs docker that runs arm64 images: natively on arm64, or through qemu,
# registered once with:
#   docker run --privileged --rm tonistiigi/binfmt --install arm64
# (on NixOS: boot.binfmt.emulatedSystems + boot.binfmt.preferStaticEmulators)
#
# Files go in and out with `docker cp` rather than bind mounts, so this also
# works from a CI runner that talks to the host's docker socket.
set -euo pipefail

UNISON_VERSION=2.53.8
UNISON_SHA256=d0d30ea63e09fc8edf10bd8cbab238fffc8ed510d27741d06b5caa816abd58b6
ALPINE_IMAGE=alpine:3.22

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/android/app/src/main/jniLibs/arm64-v8a"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/nouture"
tarball="$cache/unison-$UNISON_VERSION.tar.gz"
mkdir -p "$out" "$cache"

# Download on the host; networking inside the emulated container is flaky
if [ ! -f "$tarball" ]; then
  curl -fsSL -o "$tarball.part" \
    "https://github.com/bcpierce00/unison/archive/refs/tags/v${UNISON_VERSION}.tar.gz"
  mv "$tarball.part" "$tarball"
fi
echo "$UNISON_SHA256  $tarball" | sha256sum -c -

if ! docker run --rm --platform linux/arm64 "$ALPINE_IMAGE" true; then
  echo "Docker can't run arm64 images: register qemu first (see the top of this script)" >&2
  exit 1
fi

container=$(docker create --platform linux/arm64 \
  -e UNISON_VERSION="$UNISON_VERSION" \
  "$ALPINE_IMAGE" sh -euc '
    apk add --no-cache build-base ocaml file >/dev/null

    cd /tmp
    tar xzf /unison.tar.gz
    make -C "unison-${UNISON_VERSION}" tui LDFLAGS=-static
    mkdir /out
    strip -o /out/libunison.so "unison-${UNISON_VERSION}/src/unison"

    gcc -static -O2 -Wall -Wextra -o noussh /noussh.c
    strip -o /out/libnoussh.so noussh

    for f in /out/libunison.so /out/libnoussh.so; do
      file "$f"
      file "$f" | grep -q "statically linked" || { echo "$f is not static" >&2; exit 1; }
    done
  ')
src=$(mktemp -d)
trap 'docker rm -f "$container" >/dev/null; rm -rf "$src"' EXIT

docker cp "$tarball" "$container:/unison.tar.gz"
docker cp "$root/android/native/noussh.c" "$container:/noussh.c"
docker start -a "$container"
docker cp "$container:/out/libunison.so" "$out/"
docker cp "$container:/out/libnoussh.so" "$out/"

echo "Built into $out"

# The app validates profiles against exactly this unison version's preferences
tar xzf "$tarball" -C "$src"
python3 -I "$root/scripts/extract-unison-prefs.py" "$src/unison-$UNISON_VERSION/src" \
  > "$root/src/unison/prefs.generated.json"
echo "Wrote src/unison/prefs.generated.json"
