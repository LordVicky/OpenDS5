#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"

plan_sb() { # sb_state sysroot -> dry-run output
  env OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
      OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT="$2" \
      OPENDS5_SB_STATE="$1" OPENDS5_DRY_RUN=1 bash "$here/../opends5-install" --yes
}

out="$(plan_sb disabled /nonexistent)"
case "$out" in *mok*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "no MOK steps when SB off"

# SB on -> use DKMS default key, ensure enrollment, clean up old override
out="$(plan_sb enabled /nonexistent)"
assert_contains "$out" "/var/lib/dkms/mok.key" "uses DKMS default signing key"
assert_contains "$out" "mokutil --import" "ensures MOK enrollment (skipped at runtime if already enrolled)"
assert_contains "$out" "rm -f /etc/dkms/framework.conf.d/opends5.conf" "removes stale signing override"
case "$out" in *"keyout '/var/lib/opends5"*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "no custom OpenDS5 key generated"
finish
