#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"

plan_for() { # fixture uname_r -> dry-run output
  env OPENDS5_OS_RELEASE="$here/fixtures/$1/os-release" \
      OPENDS5_UNAME_R="$2" OPENDS5_SYSROOT=/nonexistent \
      OPENDS5_SB_STATE=disabled OPENDS5_DRY_RUN=1 \
      bash "$here/../opends5-install" --yes
}

out="$(plan_for fedora 6.15.4-200.fc44.x86_64)"
assert_contains "$out" "dnf install -y dkms kernel-devel" "fedora installs dkms+devel"
assert_contains "$out" "dkms install vds_hcd/"            "fedora dkms install"
assert_contains "$out" "/usr/src/vds_hcd-"                "fedora stages source"
assert_contains "$out" "include/" "staging copies shared vds headers (Kbuild -Iinclude)"
assert_contains "$out" "modules-load.d/vds.conf"          "fedora autoload"
# An upgrade changes MODULE_VER, so the plan must enumerate the registered
# versions rather than removing only the incoming one and stranding the old.
assert_contains "$out" "dkms status vds_hcd" "dkms removal enumerates every registered version"

out="$(plan_for fedora-cachyos 7.1.2-cachyos1.fc44.x86_64)"
assert_contains "$out" "kernel-cachyos-devel" "fedora COPR kernel uses cachyos devel"

out="$(plan_for cachyos 6.15.4-2-cachyos)"
assert_contains "$out" "pacman -S --needed --noconfirm dkms linux-cachyos-headers" "cachyos pacman"

out="$(plan_for debian 6.8.0-41-generic)"
assert_contains "$out" "apt-get install -y dkms linux-headers-6.8.0-41-generic" "debian apt"

out="$(plan_for suse 6.15.4-1-default)"
assert_contains "$out" "zypper --non-interactive install dkms kernel-default-devel" "suse zypper"

tmp="$(mktemp -d)"; mkdir -p "$tmp/run"; : > "$tmp/run/ostree-booted"
out="$(env OPENDS5_OS_RELEASE="$here/fixtures/bazzite/os-release" OPENDS5_UNAME_R=6.15.4-104.bazzite.fc44.x86_64 \
      OPENDS5_SYSROOT="$tmp" OPENDS5_SB_STATE=disabled OPENDS5_DRY_RUN=1 bash "$here/../opends5-install" --yes)"
assert_contains "$out" "rpm-ostree install --idempotent dkms kernel-devel" "bazzite layers dkms"
assert_contains "$out" "reboot" "bazzite warns about reboot"
rm -rf "$tmp"

out="$(plan_for nixos 6.15.4)"
assert_contains "$out" "opends5-vds.nix" "nixos generates snippet"

out="$(env OPENDS5_OS_RELEASE=/nonexistent OPENDS5_UNAME_R=1.0 OPENDS5_SYSROOT=/nonexistent \
      OPENDS5_SB_STATE=disabled OPENDS5_DRY_RUN=1 bash "$here/../opends5-install" --yes 2>&1 || true)"
assert_contains "$out" "unsupported" "unknown distro refuses cleanly"

# LLVM=1 on Clang/LTO kernels
tmp="$(mktemp -d)"; mkdir -p "$tmp/usr/lib/modules/6.15.4-2-cachyos/build"
printf 'CONFIG_LTO_CLANG=y\n' > "$tmp/usr/lib/modules/6.15.4-2-cachyos/build/.config"
out="$(env OPENDS5_OS_RELEASE="$here/fixtures/cachyos/os-release" OPENDS5_UNAME_R=6.15.4-2-cachyos \
      OPENDS5_SYSROOT="$tmp" OPENDS5_SB_STATE=disabled OPENDS5_DRY_RUN=1 bash "$here/../opends5-install" --yes)"
assert_contains "$out" "LLVM=1" "clang-lto kernel builds with LLVM=1"
rm -rf "$tmp"
finish
