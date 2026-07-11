#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"

# root stub: logs commands; fails when the command contains the word FAILME
cat > "$tmp/rootstub" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "$ROOTLOG"
case "$*" in *FAILME*) exit 1 ;; esac
exit 0
EOF
chmod +x "$tmp/rootstub"

base_env=(ROOTLOG="$tmp/log" OPENDS5_ROOT_CMD="$tmp/rootstub"
  OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release"
  OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT=/nonexistent
  OPENDS5_SB_STATE=disabled OPENDS5_SKIP_VERIFY=1)

: > "$tmp/log"
env "${base_env[@]}" bash "$here/../opends5-install" --yes >/dev/null
assert_contains "$(cat "$tmp/log")" "dnf install -y dkms kernel-devel" "steps executed via root helper"
assert_contains "$(cat "$tmp/log")" "dkms install vds_hcd/" "dkms step executed"

# failure rolls back and exits 4
: > "$tmp/log"
set +e
env "${base_env[@]}" OPENDS5_TEST_INJECT_FAIL=FAILME bash "$here/../opends5-install" --yes >/dev/null 2>&1
rc=$?
set -e
assert_eq 4 "$rc" "exit code 4 on step failure"
assert_contains "$(cat "$tmp/log")" "dkms remove vds_hcd/" "rollback ran"
rm -rf "$tmp"
finish
