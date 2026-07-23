#!/bin/bash
# Restage the vendored vds_hcd source and rebuild the DKMS module for the
# running kernel. Mirrors the installer's plan_source_staging + plan_dkms,
# minus the "already loaded" presence guard that makes opends5-install skip
# the build whenever a (possibly stale) vds_hcd is currently loaded.
#
# Usage:
#   sudo scripts/rebuild-vds-module.sh [VERSION]
#   sudo OPENDS5_MODULE_VERSION=1.9.0 scripts/rebuild-vds-module.sh
#
# VERSION resolution (first hit wins):
#   1. $1 argument
#   2. $OPENDS5_MODULE_VERSION
#   3. vds/module/dkms.conf PACKAGE_VERSION (unless "unknown")
#   4. vds/generate-version.sh (unless "unknown")
#   5. the version already registered with DKMS
# The old module stays resident in memory; reboot to load the freshly built one.
set -euo pipefail

# Repo root is one level up from this script, so it works from any checkout.
REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MODULE_SRC="${REPO}/vds/module"
DKMS_CONF="${MODULE_SRC}/dkms.conf"

module_version() { sed -n 's/^PACKAGE_VERSION="\(.*\)"/\1/p' "$1" 2>/dev/null; }

resolve_version() {
  local v
  for v in \
    "${1:-}" \
    "${OPENDS5_MODULE_VERSION:-}" \
    "$(module_version "$DKMS_CONF")" \
    "$("${REPO}/vds/generate-version.sh" 2>/dev/null || true)"; do
    if [ -n "$v" ] && [ "$v" != "unknown" ]; then echo "$v"; return; fi
  done
  # Last resort: the highest version already registered with DKMS (version
  # sort, so a stale 1.7.0-beta.1 never wins over an installed 1.8.1).
  dkms status vds_hcd 2>/dev/null \
    | sed -n 's|^vds_hcd[/,] *\([^,:]*\).*|\1|p' | sort -Vu | tail -1
}

VER="$(resolve_version "${1:-}")"
[ -n "$VER" ] || { echo "error: could not resolve a vds module version (pass one as an argument)" >&2; exit 1; }
DEST="/usr/src/vds_hcd-${VER}"

[ -f "$DKMS_CONF" ] || { echo "error: module source not found at ${MODULE_SRC}" >&2; exit 1; }

echo "==> version ${VER}; staging ${MODULE_SRC} -> ${DEST}"
rm -rf "${DEST}"
mkdir -p "${DEST}/include"
cp -a "${MODULE_SRC}/." "${DEST}/"
# Shared uapi/headers live in the sibling vds/include; Kbuild compiles with
# -I$(src)/include, so they must be staged alongside the module sources.
if [ -d "${REPO}/vds/include/uapi" ]; then
  cp -a "${REPO}/vds/include/." "${DEST}/include/"
fi
find "${DEST}" \( -name '*.o' -o -name '*.ko*' -o -name '*.mod*' \
  -o -name modules.order -o -name Module.symvers \) -delete
sed -i "s/^PACKAGE_VERSION=.*/PACKAGE_VERSION=\"${VER}\"/" "${DEST}/dkms.conf"

echo "==> removing every registered vds_hcd from DKMS (clears stale/broken entries too)"
for v in $(dkms status vds_hcd 2>/dev/null \
    | sed -n 's|^vds_hcd[/,] *\([^,:]*\).*|\1|p' | sort -u); do
  [ -n "$v" ] && dkms remove "vds_hcd/$v" --all >/dev/null 2>&1 || true
done

echo "==> dkms add + install (builds and signs for $(uname -r))"
dkms add "vds_hcd/${VER}"
dkms install "vds_hcd/${VER}"

echo
echo "==> DONE. The old module is still resident; REBOOT to load the new one."
echo "    Freshly built on-disk srcversion:"
modinfo "/lib/modules/$(uname -r)/extra/vds_hcd.ko"* 2>/dev/null \
  | sed -n 's/^srcversion:/    srcversion:/p' || true
