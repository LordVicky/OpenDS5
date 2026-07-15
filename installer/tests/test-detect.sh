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
assert_eq cachyos-bore "$(KERNEL_RELEASE=6.15.4-2-cachyos-bore detect_kernel_flavor)" "flavor cachyos-bore variant"
assert_eq cachyos-hardened "$(KERNEL_RELEASE=6.15.4-2-cachyos-hardened detect_kernel_flavor)" "flavor cachyos-hardened variant"
assert_eq cachyos "$(KERNEL_RELEASE=7.1.2-cachyos1.fc44.x86_64 detect_kernel_flavor)" "flavor cachyos COPR uname"
assert_eq cachyoslts "$(KERNEL_RELEASE=7.1.2-cachyoslts1.fc44.x86_64 detect_kernel_flavor)" "flavor cachyos COPR lts uname"
assert_eq zen     "$(KERNEL_RELEASE=6.15.4-zen1-1-zen detect_kernel_flavor)"     "flavor zen"
assert_eq xanmod  "$(KERNEL_RELEASE=6.15.4-x64v3-xanmod1 detect_kernel_flavor)"  "flavor xanmod"
assert_eq lqx     "$(KERNEL_RELEASE=6.15.4-lqx1-1-lqx detect_kernel_flavor)"     "flavor liquorix"
assert_eq fsync   "$(KERNEL_RELEASE=6.15.4-201.fsync.fc42.x86_64 detect_kernel_flavor)" "flavor fsync (Nobara)"
assert_eq generic "$(KERNEL_RELEASE=6.8.0-41-generic detect_kernel_flavor)"      "flavor generic"

assert_eq linux-cachyos-headers "$(headers_package arch cachyos)"   "arch cachyos headers"
assert_eq linux-cachyos-bore-headers "$(headers_package arch cachyos-bore)" "arch cachyos-bore headers"
assert_eq linux-zen-headers     "$(headers_package arch zen)"       "arch zen headers"
assert_eq linux-headers         "$(headers_package arch generic)"   "arch stock headers"
assert_eq kernel-cachyos-devel  "$(headers_package fedora cachyos)" "fedora COPR headers"
assert_eq kernel-cachyos-lts-devel "$(headers_package fedora cachyoslts)" "fedora COPR lts headers"
assert_eq kernel-cachyos-lto-devel "$(headers_package fedora cachyoslto)" "fedora COPR lto headers"
assert_eq kernel-fsync-devel    "$(headers_package fedora fsync)"   "fedora fsync headers"
assert_eq linux-xanmod-headers  "$(headers_package arch xanmod)"    "arch xanmod headers"
assert_eq linux-lqx-headers     "$(headers_package arch lqx)"       "arch liquorix headers"
assert_eq kernel-devel          "$(headers_package fedora generic)" "fedora headers"
assert_eq "linux-headers-6.8.0-41-generic" "$(KERNEL_RELEASE=6.8.0-41-generic headers_package debian generic)" "debian headers"
assert_eq kernel-default-devel  "$(KERNEL_RELEASE=6.15.4-1-default headers_package suse default)" "suse headers"
assert_eq kernel-rt-devel       "$(KERNEL_RELEASE=6.15.4-1-rt headers_package suse rt)" "suse rt headers"

finish
