#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"

# rootstub that actually executes the generated runner (safe: only the
# injected test step is planned thanks to OPENDS5_TEST_ONLY_INJECTED)
cat > "$tmp/rootstub" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "$ROOTLOG"
[ "$1" = bash ] && [ -f "${2:-}" ] && bash "$2"
EOF
chmod +x "$tmp/rootstub"

env ROOTLOG="$tmp/rootcalls" OPENDS5_ROOT_CMD="$tmp/rootstub" \
    OPENDS5_LOG_DIR="$tmp/log" \
    OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
    OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT=/nonexistent \
    OPENDS5_SB_STATE=disabled OPENDS5_SKIP_VERIFY=1 \
    OPENDS5_TEST_ONLY_INJECTED=1 \
    OPENDS5_TEST_INJECT_FAIL="echo dnf install -y dkms; echo boom-stderr >&2; false" \
    bash "$here/../opends5-install" --yes >/dev/null 2>&1

log="$tmp/log/install.log"
assert_eq 1 "$([ -f "$log" ] && echo 1 || echo 0)" "log file created"
assert_contains "$(cat "$log")" "=== opends5-install run" "run header written"
assert_contains "$(cat "$log")" "platform=fedora" "detection snapshot logged"
assert_contains "$(cat "$log")" "CMD: echo dnf install -y dkms" "commands logged"
assert_contains "$(cat "$log")" "boom-stderr" "step stderr captured in log"
assert_contains "$(cat "$log")" "exit=" "exit codes logged"
assert_contains "$(cat "$log")" "FAILED:" "failure recorded in log"
rm -rf "$tmp"
finish
