#!/usr/bin/env bash
# Build vdsd/vdsctl and collect the userspace bundle into ./vds-bin/ for the
# AppImage (electron-builder extraResources) and the installer's userspace phase.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
out="$repo/vds-bin"

cmake -S "$repo/vds" -B "$repo/vds/build-bundle" -DCMAKE_BUILD_TYPE=Release >/dev/null
make -C "$repo/vds/build-bundle" -j"$(nproc)" vdsd vdsctl >/dev/null

rm -rf "$out" && mkdir -p "$out"
install -m 0755 "$repo/vds/build-bundle/vdsd" "$repo/vds/build-bundle/vdsctl" "$out/"
install -m 0644 "$repo/vds/vdsd.service.in" \
  "$repo/vds/99-vds-dualsense-udev.rules" \
  "$repo/vds/99-vds-dualsense-wireplumber.conf" "$out/"

# ldd audit: libraries outside the universal baseline must be bundled (vds-bin/lib)
allowed='linux-vdso|ld-linux|libc\.|libm\.|libpthread|libdl|librt|libgcc_s|libstdc\+\+|libasound|libbluetooth|libdbus|libopus|libudev|libsystemd'
extras="$(ldd "$out/vdsd" | grep '=>' | grep -vE "$allowed" || true)"
if [ -n "$extras" ]; then
  echo "WARNING: non-baseline libraries must be bundled under vds-bin/lib:" >&2
  echo "$extras" >&2
fi
echo "vds-bin ready: $out"
