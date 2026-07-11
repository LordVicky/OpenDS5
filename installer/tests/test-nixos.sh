#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
cd "$tmp"
env OPENDS5_OS_RELEASE="$here/fixtures/nixos/os-release" OPENDS5_UNAME_R=6.15.4 \
    OPENDS5_SYSROOT=/nonexistent OPENDS5_SB_STATE=disabled \
    bash "$here/../opends5-install" --yes >/dev/null
assert_eq 1 "$([ -f opends5-vds.nix ] && echo 1 || echo 0)" "snippet written"
assert_eq 1 "$([ -f opends5-vds-src/dkms.conf ] && echo 1 || echo 0)" "module source copied"
assert_contains "$(cat opends5-vds.nix)" "boot.extraModulePackages" "wires extraModulePackages"
assert_contains "$(cat opends5-vds.nix)" "vds_hcd" "names the module"
cd /
rm -rf "$tmp"
finish
