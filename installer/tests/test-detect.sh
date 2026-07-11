#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
OPENDS5_INSTALL_SOURCED=1 . "$here/../opends5-install"

probe() { # fixture uname_r [sysroot] -> platform
  OS_RELEASE="$here/fixtures/$1/os-release" KERNEL_RELEASE="$2" SYSROOT="${3:-/nonexistent}" detect_platform
}

assert_eq fedora            "$(probe fedora 6.15.4-200.fc44.x86_64)"             "fedora"
assert_eq fedora            "$(probe fedora-cachyos 7.1.2-cachyos1.fc44.x86_64)" "fedora + COPR kernel"
tmp="$(mktemp -d)"; mkdir -p "$tmp/run"; : > "$tmp/run/ostree-booted"
assert_eq fedora-immutable  "$(probe bazzite 6.15.4-104.bazzite.fc44.x86_64 "$tmp")" "bazzite immutable"
rm -rf "$tmp"
assert_eq arch              "$(probe arch 6.15.4-arch1-1)"                       "arch"
assert_eq arch              "$(probe cachyos 6.15.4-2-cachyos)"                  "cachyos -> arch family"
assert_eq debian            "$(probe debian 6.8.0-41-generic)"                   "ubuntu -> debian family"
assert_eq suse              "$(probe suse 6.15.4-1-default)"                     "opensuse"
assert_eq nixos             "$(probe nixos 6.15.4)"                              "nixos"
assert_eq unsupported       "$(OS_RELEASE=/nonexistent KERNEL_RELEASE=1.0 SYSROOT=/nonexistent detect_platform)" "unknown -> unsupported"

assert_eq cachyos "$(KERNEL_RELEASE=6.15.4-2-cachyos detect_kernel_flavor)"      "flavor cachyos"
assert_eq zen     "$(KERNEL_RELEASE=6.15.4-zen1-1-zen detect_kernel_flavor)"     "flavor zen"
assert_eq generic "$(KERNEL_RELEASE=6.8.0-41-generic detect_kernel_flavor)"      "flavor generic"

assert_eq linux-cachyos-headers "$(headers_package arch cachyos)"   "arch cachyos headers"
assert_eq linux-zen-headers     "$(headers_package arch zen)"       "arch zen headers"
assert_eq linux-headers         "$(headers_package arch generic)"   "arch stock headers"
assert_eq kernel-cachyos-devel  "$(headers_package fedora cachyos)" "fedora COPR headers"
assert_eq kernel-devel          "$(headers_package fedora generic)" "fedora headers"
assert_eq "linux-headers-6.8.0-41-generic" "$(KERNEL_RELEASE=6.8.0-41-generic headers_package debian generic)" "debian headers"
assert_eq kernel-default-devel  "$(headers_package suse generic)"   "suse headers"

# clang/lto detection
tmp="$(mktemp -d)"; mkdir -p "$tmp/usr/lib/modules/6.1-t/build"
assert_eq 0 "$(SYSROOT=$tmp KERNEL_RELEASE=6.1-t detect_clang_lto)" "no config -> no lto"
printf 'CONFIG_LTO_CLANG=y\n' > "$tmp/usr/lib/modules/6.1-t/build/.config"
assert_eq 1 "$(SYSROOT=$tmp KERNEL_RELEASE=6.1-t detect_clang_lto)" "lto config detected"
rm -rf "$tmp"
finish
