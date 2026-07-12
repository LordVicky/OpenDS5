#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
cat > "$tmp/rootstub" <<'EOF'
#!/usr/bin/env bash
[ "$1" = bash ] && [ -f "${2:-}" ] && bash "$2"
EOF
chmod +x "$tmp/rootstub"

run_json() { # inject_cmd
  env OPENDS5_TEST_INJECT_FAIL="$1" \
      OPENDS5_ROOT_CMD="$tmp/rootstub" OPENDS5_LOG_DIR="$tmp/log" \
      OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
      OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT=/nonexistent \
      OPENDS5_SB_STATE=disabled OPENDS5_SKIP_VERIFY=1 OPENDS5_TEST_ONLY_INJECTED=1 \
      bash "$here/../opends5-install" --yes --json-progress
}

out="$(run_json true)"
assert_contains "$out" '"event":"plan"'   "plan event emitted"
assert_contains "$out" '"log":'           "plan event carries log path"
assert_contains "$out" '"status":"start"' "step start emitted"
assert_contains "$out" '"status":"ok"'    "step ok emitted"
assert_contains "$out" '"event":"done","exit":0' "done event"
case "$out" in *"==>"*|*"The following steps"*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "human progress suppressed in json mode"

set +e
out="$(run_json false)"
rc=$?
set -e
assert_eq 4 "$rc" "failure still exits 4"
assert_contains "$out" '"status":"fail","exit":4' "step fail emitted"
assert_contains "$out" '"event":"done","exit":4' "done event carries failure exit"
rm -rf "$tmp"
finish
