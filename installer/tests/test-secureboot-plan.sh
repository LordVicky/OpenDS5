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

# SB on, enforcement off -> sign, no enrollment
out="$(plan_sb enabled /nonexistent)"
assert_contains "$out" "/var/lib/opends5/mok.key" "signing key configured"
assert_contains "$out" "framework.conf.d/opends5.conf" "dkms signing framework config"
case "$out" in *"mokutil --import"*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "no enrollment when enforcement off"

# SB on + lockdown integrity -> enrollment step present
tmp="$(mktemp -d)"; mkdir -p "$tmp/sys/kernel/security"
printf 'none [integrity] confidentiality\n' > "$tmp/sys/kernel/security/lockdown"
out="$(plan_sb enabled "$tmp")"
assert_contains "$out" "mokutil --import" "enrollment when enforced"
rm -rf "$tmp"
finish
