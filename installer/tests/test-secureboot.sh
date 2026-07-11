#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
OPENDS5_INSTALL_SOURCED=1 . "$here/../opends5-install"

tmp="$(mktemp -d)"
mkdir -p "$tmp/sys/kernel/security" "$tmp/usr/lib/modules/6.1-test/build"

printf 'none [integrity] confidentiality\n' > "$tmp/sys/kernel/security/lockdown"
assert_eq integrity "$(SYSROOT=$tmp detect_lockdown)" "lockdown integrity"
printf '[none] integrity confidentiality\n' > "$tmp/sys/kernel/security/lockdown"
assert_eq none "$(SYSROOT=$tmp detect_lockdown)" "lockdown none"
assert_eq none "$(SYSROOT=/nonexistent detect_lockdown)" "lockdown file missing -> none"

assert_eq 1 "$(OPENDS5_SB_STATE=enabled detect_secureboot)"  "SB enabled override"
assert_eq 0 "$(OPENDS5_SB_STATE=disabled detect_secureboot)" "SB disabled override"

# enforcement: lockdown none + no MODULE_SIG_FORCE -> 0 (the CachyOS-kernel case)
: > "$tmp/usr/lib/modules/6.1-test/build/.config"
assert_eq 0 "$(SYSROOT=$tmp KERNEL_RELEASE=6.1-test detect_sig_enforced)" "SB on but not enforced"
printf 'CONFIG_MODULE_SIG_FORCE=y\n' > "$tmp/usr/lib/modules/6.1-test/build/.config"
assert_eq 1 "$(SYSROOT=$tmp KERNEL_RELEASE=6.1-test detect_sig_enforced)" "MODULE_SIG_FORCE enforced"
printf 'none [integrity] confidentiality\n' > "$tmp/sys/kernel/security/lockdown"
: > "$tmp/usr/lib/modules/6.1-test/build/.config"
assert_eq 1 "$(SYSROOT=$tmp KERNEL_RELEASE=6.1-test detect_sig_enforced)" "lockdown enforced"
rm -rf "$tmp"
finish
