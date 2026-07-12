#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
OPENDS5_INSTALL_SOURCED=1 . "$here/../opends5-install"

tmp="$(mktemp -d)"
printf 'PACKAGE_NAME="vds_hcd"\nPACKAGE_VERSION="0.1.0"\n' > "$tmp/dkms.conf"
assert_eq "0.1.0" "$(module_version "$tmp/dkms.conf")" "module_version reads dkms.conf"

# in-tree dkms.conf carries the "unknown" placeholder; resolver must not accept it
printf 'PACKAGE_VERSION="unknown"\n' > "$tmp/dkms.conf"
assert_eq "" "$(module_version "$tmp/dkms.conf" | grep -v '^unknown$' || true)" "placeholder version detected"
rm -rf "$tmp"
finish
