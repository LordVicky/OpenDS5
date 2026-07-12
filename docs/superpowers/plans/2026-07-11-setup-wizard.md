# Setup Wizard + Userspace Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-launch setup wizard in the Electron app that runs the complete system install (kernel module + newly bundled vdsd/vdsctl userspace) under one pkexec authentication, with persistent logs and a JSON progress stream; CLI gains the same userspace phase.

**Architecture:** `installer/opends5-install` stays the single backend: new userspace plan steps, `--json-progress` events on stdout, and full command logging to `/var/log/opends5/install.log`. The Electron main process gets a `setup-service` that detects first launch, spawns the installer, and relays parsed progress over IPC to a `SetupWizard` renderer view shown in a dedicated window before the main window.

**Tech Stack:** bash, dkms, pkexec; Electron/TypeScript/React/vitest; GitHub Actions (ubuntu-22.04).

## Global Constraints

- Branch: `feature/setup-wizard` off `dev`. Spec: `docs/superpowers/specs/2026-07-11-setup-wizard-design.md` (its Security section is binding).
- Executors MUST run on Fable 5 or Opus 4.8 only.
- Single authentication: all privileged steps stay inside the one root runner from phase 1. The app never reads or stores the password.
- Installer exit codes keep phase-1 meanings: 0 ok, 2 usage, 3 unsupported, 4 step failure (rolled back), 5 verify failure, 6 reboot-for-MOK.
- Root log: `/var/log/opends5/install.log`. Unprivileged log: `~/.local/state/opends5/install.log`. Same format: run header (version, distro, kernel, SB/lockdown), each command, full stdout+stderr, exit codes. No secrets ever logged.
- Wizard is Linux-only (`process.platform === 'linux'`).
- Before every commit: `bash installer/tests/run-tests.sh` green and, when TS changed, `cd ds5-bridge/companion && npm run typecheck && npx vitest run src` green.

---

### Task 1: Installer logging

**Files:**
- Modify: `installer/opends5-install`
- Test: `installer/tests/test-logging.sh`

**Interfaces:**
- Produces: env override `OPENDS5_LOG_DIR` (tests point it at a tmpdir; defaults `/var/log/opends5` in the runner, `${XDG_STATE_HOME:-$HOME/.local/state}/opends5` unprivileged). `log_path` echoes the active unprivileged log file. The generated runner writes each step's full output to the root log while keeping stdout for progress lines.

- [ ] **Step 1: Write the failing test** — `installer/tests/test-logging.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"

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
    OPENDS5_TEST_INJECT_FAIL="echo boom-stderr >&2; false" \
    bash "$here/../opends5-install" --yes >/dev/null 2>&1

log="$tmp/log/install.log"
assert_eq 1 "$([ -f "$log" ] && echo 1 || echo 0)" "log file created"
assert_contains "$(cat "$log")" "=== opends5-install run" "run header written"
assert_contains "$(cat "$log")" "platform=fedora" "detection snapshot logged"
assert_contains "$(cat "$log")" "dnf install -y dkms" "commands logged"
assert_contains "$(cat "$log")" "boom-stderr" "step stderr captured in log"
assert_contains "$(cat "$log")" "exit=" "exit codes logged"
rm -rf "$tmp"
finish
```

Note: this executes the generated runner for real via the stub, so PLAN_CMDs would run real dnf. To keep it safe the test relies on Step 3's `OPENDS5_TEST_ONLY_INJECTED=1` mode added below, which makes `build_plan` emit ONLY the injected step. Add `OPENDS5_TEST_ONLY_INJECTED=1` to the env above.

- [ ] **Step 2: Run to verify FAIL** — `bash installer/tests/test-logging.sh` → "log file created" fails.

- [ ] **Step 3: Implement** in `installer/opends5-install`:

Add after the injectable-env block:

```bash
LOG_DIR="${OPENDS5_LOG_DIR:-}"
user_log_dir() { echo "${OPENDS5_LOG_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/opends5}"; }
root_log_dir() { echo "${OPENDS5_LOG_DIR:-/var/log/opends5}"; }
log_path() { echo "$(user_log_dir)/install.log"; }

log_header() { # target_file
  {
    printf '=== opends5-install run %s ===\n' "$(date -Is)"
    printf 'version=%s platform=%s kernel=%s flavor=%s sb=%s lockdown=%s\n' \
      "$MODULE_VER" "$(detect_platform)" "$KERNEL_RELEASE" \
      "$(detect_kernel_flavor)" "$(detect_secureboot)" "$(detect_lockdown)"
  } >> "$1"
}
```

In `build_plan`, support test isolation — wrap the whole `case` in:

```bash
  if [ "${OPENDS5_TEST_ONLY_INJECTED:-0}" != "1" ]; then
    case "$platform" in
      ... existing cases unchanged ...
    esac
  fi
```

(keep the `OPENDS5_TEST_INJECT_FAIL` append after it, unconditional).

In `build_runner`, make the runner log everything. Replace the body with:

```bash
build_runner() { # path
  local rlog
  rlog="$(root_log_dir)/install.log"
  {
    printf '#!/usr/bin/env bash\nset -u\n'
    printf 'mkdir -p %q\n' "$(root_log_dir)"
    printf 'RLOG=%q\n' "$rlog"
    printf 'log() { printf "%%s\\n" "$*" >> "$RLOG"; }\n'
    printf 'fail() {\n'
    printf '  echo "FAILED: $1" >&2\n'
    printf '  echo "  Retry manually with: sudo bash -c \\"$2\\"" >&2\n'
    printf '  echo "  Full log: $RLOG" >&2\n'
    printf '  echo "  Troubleshooting: https://github.com/LordVicky/OpenDS5/blob/main/docs/INSTALLER.md" >&2\n'
    printf '  log "FAILED: $1"\n'
    printf '  echo "Rolling back partial DKMS registration..." >&2\n'
    printf '  dkms remove vds_hcd/%s --all >/dev/null 2>&1 || true\n' "$MODULE_VER"
    printf '  exit 4\n}\n'
    printf 'log "=== opends5-install run $(date -Is) ==="\n'
    printf 'log %q\n' "version=$MODULE_VER platform=$(detect_platform) kernel=$KERNEL_RELEASE flavor=$(detect_kernel_flavor) sb=$(detect_secureboot) lockdown=$(detect_lockdown)"
    local i
    for i in "${!PLAN_CMD[@]}"; do
      printf 'echo %q\n' "==> ${PLAN_DESC[$i]}"
      printf 'log %q\n' "STEP $((i + 1)): ${PLAN_DESC[$i]}"
      printf 'log %q\n' "CMD: ${PLAN_CMD[$i]}"
      printf '( %s ) >>"$RLOG" 2>&1; rc=$?\n' "${PLAN_CMD[$i]}"
      printf 'log "exit=$rc"\n'
      printf '[ "$rc" -eq 0 ] || fail %q %q\n' "${PLAN_DESC[$i]}" "${PLAN_CMD[$i]}"
    done
    if [ "${OPENDS5_SKIP_VERIFY:-0}" != "1" ]; then
      printf 'echo "==> Loading module"\nlog "STEP: modprobe vds_hcd"\n'
      if [ "$(detect_secureboot)" = "1" ]; then
        printf 'modprobe vds_hcd >>"$RLOG" 2>&1 || { echo "Module built and signed, but the kernel rejected the key."; echo "If you just enrolled the MOK key: reboot, complete Enroll MOK, and the module will load automatically."; log "modprobe rejected (MOK pending)"; exit 6; }\n'
      else
        printf 'modprobe vds_hcd >>"$RLOG" 2>&1 || fail "Load vds_hcd" "modprobe vds_hcd"\n'
      fi
      printf 'if systemctl cat vdsd.service >/dev/null 2>&1; then\n'
      printf '  echo "==> Starting vdsd.service"\n  log "STEP: enable vdsd.service"\n'
      printf '  systemctl enable --now vdsd.service >>"$RLOG" 2>&1 || fail "Start vdsd.service" "systemctl enable --now vdsd.service"\n'
      printf 'else\n  echo "vdsd.service not installed yet; skipping daemon start"\nfi\n'
    fi
  } > "$1"
}
```

Also mirror to the unprivileged log: at the top of `confirm_and_execute` (non-nixos path, after confirmation), add:

```bash
  mkdir -p "$(user_log_dir)"
  log_header "$(log_path)"
  print_plan >> "$(log_path)"
```

Note the test's rootstub executes the runner as the current user, so `OPENDS5_LOG_DIR` makes root_log_dir and user_log_dir the same tmpdir — that's what the assertions read.

- [ ] **Step 4: Run to verify PASS** — full `bash installer/tests/run-tests.sh` green (the execute tests' rootstub only cats the runner, so log lines like `( cmd ) >>"$RLOG"` still contain the command strings they grep for).

- [ ] **Step 5: Commit** — `git add installer && git commit -m "feat(installer): persistent install logs with run header and per-step output"`

---

### Task 2: JSON progress protocol

**Files:**
- Modify: `installer/opends5-install`
- Test: `installer/tests/test-json-progress.sh`

**Interfaces:**
- Produces: `--json-progress` flag. Events on stdout, one JSON object per line:
  - `{"event":"plan","total":N,"steps":["desc",...],"log":"<root log path>"}`
  - `{"event":"step","index":I,"status":"start"}` / `...,"status":"ok"}` / `...,"status":"fail","exit":4}` (index is 0-based into `steps`)
  - `{"event":"done","exit":0}` (also emitted with the real code on 5/6)
  - Human output suppressed while the flag is on. `json_escape` helper handles quotes/backslashes in descs.

- [ ] **Step 1: Write the failing test** — `installer/tests/test-json-progress.sh`:

```bash
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

run_json() { # extra env...
  env "$@" OPENDS5_ROOT_CMD="$tmp/rootstub" OPENDS5_LOG_DIR="$tmp/log" \
      OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
      OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT=/nonexistent \
      OPENDS5_SB_STATE=disabled OPENDS5_SKIP_VERIFY=1 OPENDS5_TEST_ONLY_INJECTED=1 \
      bash "$here/../opends5-install" --yes --json-progress
}

out="$(run_json OPENDS5_TEST_INJECT_FAIL=true)"
assert_contains "$out" '"event":"plan"'  "plan event emitted"
assert_contains "$out" '"log":'          "plan event carries log path"
assert_contains "$out" '"status":"start"' "step start emitted"
assert_contains "$out" '"status":"ok"'    "step ok emitted"
assert_contains "$out" '"event":"done","exit":0' "done event"
case "$out" in *"==>"*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "human progress suppressed in json mode"

set +e
out="$(run_json OPENDS5_TEST_INJECT_FAIL="false")"
rc=$?
set -e
assert_eq 4 "$rc" "failure still exits 4"
assert_contains "$out" '"status":"fail","exit":4' "step fail emitted"
rm -rf "$tmp"
finish
```

- [ ] **Step 2: Run to verify FAIL** (unknown option: --json-progress, exit 2).

- [ ] **Step 3: Implement.** Add `JSON_PROGRESS=0` global; in `main`'s arg loop add `--json-progress) JSON_PROGRESS=1 ;;`. Add helper:

```bash
json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

emit_plan_json() {
  local steps="" i
  for i in "${!PLAN_DESC[@]}"; do
    steps="${steps}${steps:+,}\"$(json_escape "${PLAN_DESC[$i]}")\""
  done
  printf '{"event":"plan","total":%d,"steps":[%s],"log":"%s"}\n' \
    "${#PLAN_DESC[@]}" "$steps" "$(json_escape "$(root_log_dir)/install.log")"
}
```

In `main`, after `print_plan` becomes conditional:

```bash
  if [ "$JSON_PROGRESS" = "1" ]; then emit_plan_json; else print_plan; fi
```

In `build_runner`, emit JSON instead of `==>` lines when `JSON_PROGRESS=1`: for each step replace the two progress printfs with:

```bash
      if [ "$JSON_PROGRESS" = "1" ]; then
        printf 'echo %q\n' "{\"event\":\"step\",\"index\":$i,\"status\":\"start\"}"
      else
        printf 'echo %q\n' "==> ${PLAN_DESC[$i]}"
      fi
```

and after the `[ "$rc" -eq 0 ] ||` check line, when JSON: emit ok/fail —

```bash
      if [ "$JSON_PROGRESS" = "1" ]; then
        printf '[ "$rc" -eq 0 ] && echo %q || { echo %q; fail_quiet %q; }\n' \
          "{\"event\":\"step\",\"index\":$i,\"status\":\"ok\"}" \
          "{\"event\":\"step\",\"index\":$i,\"status\":\"fail\",\"exit\":4}" \
          "${PLAN_DESC[$i]}"
      else
        printf '[ "$rc" -eq 0 ] || fail %q %q\n' "${PLAN_DESC[$i]}" "${PLAN_CMD[$i]}"
      fi
```

where the runner preamble also defines `fail_quiet()` (same rollback/exit-4 as `fail` but writes details only to `$RLOG`, keeping stdout JSON-clean):

```bash
    printf 'fail_quiet() { log "FAILED: $1"; dkms remove vds_hcd/%s --all >/dev/null 2>&1 || true; exit 4; }\n' "$MODULE_VER"
```

The modprobe/vdsd tail sections: gate their `echo "==> …"` lines on non-JSON the same way (in JSON mode they're silent; their failures use exit codes). Finally in `confirm_and_execute`, after the runner returns:

```bash
  if [ "$JSON_PROGRESS" = "1" ]; then printf '{"event":"done","exit":%d}\n' "$rc"; fi
  [ "$rc" -eq 0 ] || exit "$rc"
```

(also emit the done event with exit 0 at the very end of `main`'s success path — put it after `verify_install`/skip-verify so exactly one done event is printed; simplest: emit in `confirm_and_execute` for rc!=0, and at the end of `main` for rc==0.)

- [ ] **Step 4: Run to verify PASS** — whole installer suite green.
- [ ] **Step 5: Commit** — `git add installer && git commit -m "feat(installer): --json-progress event stream for GUI consumption"`

---

### Task 3: Userspace plan steps

**Files:**
- Modify: `installer/opends5-install`
- Test: `installer/tests/test-userspace.sh`

**Interfaces:**
- Produces: `resolve_userspace_source` sets `USERSPACE_SRC` (dir containing `vdsd`, `vdsctl`, `vdsd.service.in`, `99-vds-dualsense-udev.rules`, `99-vds-dualsense-wireplumber.conf`) from `${APPDIR}/resources/vds-bin`, `<script_dir>/../vds-bin`, or env `OPENDS5_USERSPACE_DIR`; empty when absent. `plan_userspace` appends the 5 spec steps; `detect_kernel_satisfied` echoes 1 when `${SYSROOT}/sys/module/vds_hcd` exists (kernel steps then skipped, making userspace-only re-runs fast).

- [ ] **Step 1: Write the failing test** — `installer/tests/test-userspace.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"

# fake userspace bundle
mkdir -p "$tmp/vds-bin"
for f in vdsd vdsctl; do : > "$tmp/vds-bin/$f"; done
printf 'ExecStart=@VDS_SYSTEMD_VDSD@\n' > "$tmp/vds-bin/vdsd.service.in"
: > "$tmp/vds-bin/99-vds-dualsense-udev.rules"
: > "$tmp/vds-bin/99-vds-dualsense-wireplumber.conf"

plan() { # extra env...
  env "$@" OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
      OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SB_STATE=disabled \
      OPENDS5_DRY_RUN=1 bash "$here/../opends5-install" --yes
}

# without bundle: no userspace steps
out="$(plan OPENDS5_SYSROOT=/nonexistent)"
case "$out" in *"/usr/local/bin/vdsd"*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "no userspace steps without bundle"

# with bundle: all five steps present
out="$(plan OPENDS5_SYSROOT=/nonexistent OPENDS5_USERSPACE_DIR="$tmp/vds-bin")"
assert_contains "$out" "install -m 0755 '$tmp/vds-bin/vdsd' '$tmp/vds-bin/vdsctl' /usr/local/bin/" "binaries installed"
assert_contains "$out" "s|@VDS_SYSTEMD_VDSD@|/usr/local/bin/vdsd|" "service template rendered"
assert_contains "$out" "/etc/systemd/system/vdsd.service" "unit installed"
assert_contains "$out" "/etc/udev/rules.d/" "udev rules installed"
assert_contains "$out" "udevadm control --reload-rules" "udev reloaded"
assert_contains "$out" "groupadd -f vds" "group created"
assert_contains "$out" "usermod -aG vds '$(id -un)'" "invoking user added to group"
assert_contains "$out" "wireplumber.conf.d" "wireplumber conf installed"
assert_contains "$out" "chown" "wireplumber conf owned by user"
assert_contains "$out" "systemctl daemon-reload" "daemon reloaded"

# kernel satisfied -> kernel steps skipped, userspace kept
mkdir -p "$tmp/sys/module/vds_hcd"
out="$(plan OPENDS5_SYSROOT="$tmp" OPENDS5_USERSPACE_DIR="$tmp/vds-bin")"
case "$out" in *"dkms install"*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "kernel steps skipped when module already loaded"
assert_contains "$out" "/usr/local/bin/" "userspace steps still planned"
rm -rf "$tmp"
finish
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement** in `installer/opends5-install`:

```bash
USERSPACE_SRC=""

resolve_userspace_source() {
  local script_dir cand
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  for cand in "${OPENDS5_USERSPACE_DIR:-/nonexistent}" \
              "${APPDIR:-/nonexistent}/resources/vds-bin" \
              "$script_dir/../vds-bin"; do
    if [ -f "$cand/vdsd" ] && [ -f "$cand/vdsd.service.in" ]; then
      USERSPACE_SRC="$cand"; return
    fi
  done
}

detect_kernel_satisfied() {
  if [ -d "${SYSROOT}/sys/module/vds_hcd" ]; then echo 1; else echo 0; fi
}

plan_userspace() {
  [ -n "$USERSPACE_SRC" ] || return 0
  local user home
  user="$(id -un)"
  home="$HOME"
  plan_add "Install vdsd and vdsctl to /usr/local/bin" \
    "install -m 0755 '${USERSPACE_SRC}/vdsd' '${USERSPACE_SRC}/vdsctl' /usr/local/bin/"
  plan_add "Install systemd unit and udev rules" \
    "sed 's|@VDS_SYSTEMD_VDSD@|/usr/local/bin/vdsd|' '${USERSPACE_SRC}/vdsd.service.in' > /etc/systemd/system/vdsd.service && \
     install -m 0644 '${USERSPACE_SRC}/99-vds-dualsense-udev.rules' /etc/udev/rules.d/ && \
     udevadm control --reload-rules && udevadm trigger --subsystem-match=input || true"
  plan_add "Create vds group and add ${user}" \
    "groupadd -f vds && usermod -aG vds '${user}'"
  plan_add "Install wireplumber config for ${user}" \
    "mkdir -p '${home}/.config/wireplumber/wireplumber.conf.d' && \
     install -m 0644 '${USERSPACE_SRC}/99-vds-dualsense-wireplumber.conf' '${home}/.config/wireplumber/wireplumber.conf.d/' && \
     chown -R '${user}:' '${home}/.config/wireplumber'"
  plan_add "Reload systemd" "systemctl daemon-reload"
}
```

In `build_plan`, for each dkms-based platform change the step sequence to skip kernel work when satisfied and append userspace. Refactor the five dkms cases to call a shared helper (all five bodies were identical apart from the package-install step):

```bash
plan_kernel_and_userspace() { # pkg_install_desc pkg_install_cmd
  if [ "$(detect_kernel_satisfied)" = "1" ] && [ -n "$USERSPACE_SRC" ]; then
    plan_add "Kernel module already loaded; skipping module build" "true"
  else
    plan_add "$1" "$2"
    plan_secureboot; plan_source_staging; plan_dkms
  fi
  plan_userspace
}
```

and the cases become e.g. `fedora) plan_kernel_and_userspace "Install DKMS and kernel headers (dnf)" "dnf install -y dkms ${hdrs}" ;;` (bazzite keeps its two extra rpm-ostree plan_adds before calling it). Call `resolve_userspace_source` in `main` right after `resolve_module_source`.

- [ ] **Step 4: Run to verify PASS** — whole installer suite (existing plan tests still pass because without a bundle the plans are unchanged).
- [ ] **Step 5: Commit** — `git add installer && git commit -m "feat(installer): userspace phase — vdsd/vdsctl, unit, udev, group, wireplumber"`

---

### Task 4: CI build of vdsd/vdsctl + AppImage bundling

**Files:**
- Create: `.github/workflows/build-vdsd.yml`
- Create: `scripts/collect-vds-bin.sh`
- Modify: `ds5-bridge/companion/package.json` (extraResources)

**Interfaces:**
- Produces: CI artifact `vds-bin/` = `vdsd vdsctl vdsd.service.in 99-vds-dualsense-udev.rules 99-vds-dualsense-wireplumber.conf` (+ `lib/` when ldd audit demands). Locally, `scripts/collect-vds-bin.sh` builds the same layout into `vds-bin/` at repo root (gitignored) so `installer:linux` can bundle it.

- [ ] **Step 1: Write `scripts/collect-vds-bin.sh`:**

```bash
#!/usr/bin/env bash
# Build vdsd/vdsctl and collect the userspace bundle into ./vds-bin/.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
out="$repo/vds-bin"
cmake -S "$repo/vds" -B "$repo/vds/build-bundle" -DCMAKE_BUILD_TYPE=Release
make -C "$repo/vds/build-bundle" -j"$(nproc)" vdsd vdsctl
rm -rf "$out" && mkdir -p "$out"
install -m 0755 "$repo/vds/build-bundle/vdsd" "$repo/vds/build-bundle/vdsctl" "$out/"
install -m 0644 "$repo/vds/vdsd.service.in" \
  "$repo/vds/99-vds-dualsense-udev.rules" \
  "$repo/vds/99-vds-dualsense-wireplumber.conf" "$out/"
# ldd audit: flag non-universal libraries (bundle them under vds-bin/lib if any)
allowed='linux-vdso|ld-linux|libc\.|libm\.|libpthread|libdl|librt|libgcc_s|libstdc\+\+|libasound|libbluetooth|libsystemd|libudev'
if ldd "$out/vdsd" | grep -vE "$allowed" | grep '=>' ; then
  echo "WARNING: non-baseline libraries above must be bundled under vds-bin/lib" >&2
fi
echo "vds-bin ready: $out"
```

Add `vds-bin/` to the repo-root `.gitignore`.

- [ ] **Step 2: Create `.github/workflows/build-vdsd.yml`:**

```yaml
name: build-vdsd
on:
  push:
    branches: [dev, main]
    paths: ['vds/**', 'scripts/collect-vds-bin.sh', '.github/workflows/build-vdsd.yml']
  workflow_dispatch:
jobs:
  vdsd:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - name: deps
        run: sudo apt-get update && sudo apt-get install -y cmake g++ libasound2-dev libbluetooth-dev libsystemd-dev libudev-dev
      - name: build bundle
        run: bash scripts/collect-vds-bin.sh
      - uses: actions/upload-artifact@v4
        with: { name: vds-bin, path: vds-bin/ }
```

(If `cmake`/`make` targets differ — check `vds/CMakeLists.txt` target names before finalizing; adjust `make ... vdsd vdsctl` to the actual target names and the apt deps to what CMake reports missing. This is expected iteration, not scope creep.)

- [ ] **Step 3: Wire extraResources.** In `ds5-bridge/companion/package.json` `build.extraResources` add:

```json
{ "from": "../../vds-bin", "to": "vds-bin" },
```

(electron-builder skips missing dirs with a warning; the AppImage script/docs say to run `scripts/collect-vds-bin.sh` — or download the CI artifact — before `npm run installer:linux`.)

- [ ] **Step 4: Verify locally** — `bash scripts/collect-vds-bin.sh` builds on the dev box and produces `vds-bin/` with 5 files; `bash installer/opends5-install --dry-run --yes` from repo root with `OPENDS5_USERSPACE_DIR="$PWD/vds-bin"` shows the userspace steps. Run `cd ds5-bridge/companion && npm run typecheck`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "ci: build portable vdsd/vdsctl bundle on ubuntu-22.04 and bundle into AppImage"`

---

### Task 5: Main-process setup service

**Files:**
- Create: `ds5-bridge/companion/src/main/setup-service.ts`
- Test: `ds5-bridge/companion/src/main/setup-service.test.ts`

**Interfaces:**
- Consumes: installer CLI (`--dry-run --yes` human plan; `--yes --json-progress` events; exit codes).
- Produces (used by Tasks 6–7):

```ts
export type SetupProgressEvent =
  | { event: 'plan'; total: number; steps: string[]; log: string }
  | { event: 'step'; index: number; status: 'start' | 'ok' | 'fail'; exit?: number }
  | { event: 'done'; exit: number };
export function parseProgressLine(line: string): SetupProgressEvent | null;
export function isSetupNeeded(opts?: { moduleSysfs?: string; serviceActive?: () => boolean }): boolean;
export class SetupService {
  constructor(installerPath: string, appVersion: string);
  dryRunPlan(): Promise<string>;                     // spawns bash installer --dry-run --yes
  install(onEvent: (e: SetupProgressEvent) => void): Promise<number>; // spawns installer --yes --json-progress; resolves exit code
}
```

`install()` spawns the installer **unprivileged** (`bash <installer> --yes --json-progress`); the installer escalates itself via pkexec (its existing `as_root`), so the polkit dialog appears once. stdout is line-buffered and each line goes through `parseProgressLine`; non-JSON lines are ignored. `OPENDS5_MODULE_VERSION` is set from `appVersion` in both spawns.

- [ ] **Step 1: Write the failing test** — `ds5-bridge/companion/src/main/setup-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isSetupNeeded, parseProgressLine } from './setup-service';

describe('parseProgressLine', () => {
  it('parses plan, step and done events', () => {
    expect(parseProgressLine('{"event":"plan","total":2,"steps":["a","b"],"log":"/var/log/opends5/install.log"}'))
      .toEqual({ event: 'plan', total: 2, steps: ['a', 'b'], log: '/var/log/opends5/install.log' });
    expect(parseProgressLine('{"event":"step","index":1,"status":"fail","exit":4}'))
      .toEqual({ event: 'step', index: 1, status: 'fail', exit: 4 });
    expect(parseProgressLine('{"event":"done","exit":0}')).toEqual({ event: 'done', exit: 0 });
  });
  it('ignores non-JSON noise', () => {
    expect(parseProgressLine('==> Installing')).toBeNull();
    expect(parseProgressLine('{"event":"unknown"}')).toBeNull();
    expect(parseProgressLine('')).toBeNull();
  });
});

describe('isSetupNeeded', () => {
  it('needed when module sysfs missing', () => {
    expect(isSetupNeeded({ moduleSysfs: '/nonexistent/vds_hcd', serviceActive: () => true })).toBe(true);
  });
  it('needed when service inactive', () => {
    expect(isSetupNeeded({ moduleSysfs: '/', serviceActive: () => false })).toBe(true);
  });
  it('not needed when both fine', () => {
    expect(isSetupNeeded({ moduleSysfs: '/', serviceActive: () => true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run src/main/setup-service.test.ts` → module not found.

- [ ] **Step 3: Implement `setup-service.ts`:**

```ts
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

export type SetupProgressEvent =
  | { event: 'plan'; total: number; steps: string[]; log: string }
  | { event: 'step'; index: number; status: 'start' | 'ok' | 'fail'; exit?: number }
  | { event: 'done'; exit: number };

export function parseProgressLine(line: string): SetupProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj.event === 'plan' && Array.isArray(obj.steps)) return obj;
    if (obj.event === 'step' && typeof obj.index === 'number') return obj;
    if (obj.event === 'done' && typeof obj.exit === 'number') return obj;
    return null;
  } catch {
    return null;
  }
}

export function isSetupNeeded(opts?: {
  moduleSysfs?: string;
  serviceActive?: () => boolean;
}): boolean {
  const sysfs = opts?.moduleSysfs ?? '/sys/module/vds_hcd';
  const serviceActive =
    opts?.serviceActive ??
    (() => spawnSync('systemctl', ['is-active', '--quiet', 'vdsd.service']).status === 0);
  if (!fs.existsSync(sysfs)) return true;
  return !serviceActive();
}

export class SetupService {
  constructor(
    private readonly installerPath: string,
    private readonly appVersion: string,
  ) {}

  private env() {
    return { ...process.env, OPENDS5_MODULE_VERSION: this.appVersion };
  }

  dryRunPlan(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', [this.installerPath, '--dry-run', '--yes'], { env: this.env() });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) =>
        code === 0 ? resolve(out) : reject(new Error(`dry-run failed (${code}): ${err}`)),
      );
    });
  }

  install(onEvent: (e: SetupProgressEvent) => void): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn('bash', [this.installerPath, '--yes', '--json-progress'], {
        env: this.env(),
      });
      let buffer = '';
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const event = parseProgressLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          if (event) onEvent(event);
        }
      });
      child.on('close', (code) => resolve(code ?? 1));
    });
  }
}
```

- [ ] **Step 4: Run to verify PASS** + `npm run typecheck`.
- [ ] **Step 5: Commit** — `git add src/main/setup-service*.ts && git commit -m "feat(companion): setup service — first-launch detection and installer progress stream"`

---

### Task 6: IPC contract + preload

**Files:**
- Modify: `ds5-bridge/companion/src/preload.ts`
- Modify: `ds5-bridge/companion/src/renderer/global.d.ts`
- Test: `ds5-bridge/companion/src/main/setup-ipc.test.ts`

**Interfaces:**
- Produces renderer API `window.setup` (Linux setup window only):

```ts
interface SetupApi {
  getPlan(): Promise<{ steps: string[] } | { unsupported: string }>;
  install(): Promise<void>;                      // fire-and-forget; progress via onProgress
  onProgress(cb: (e: SetupProgressEvent) => void): () => void;
  skip(): Promise<void>;                         // persists skip + opens main window
  finish(): Promise<void>;                       // opens main window
  openLog(): Promise<void>;                      // shell-opens the log file
  copyDiagnostics(): Promise<void>;              // clipboard: detection snapshot + log tail
}
```

IPC channels: `setup:get-plan`, `setup:install`, `setup:progress` (main→renderer), `setup:skip`, `setup:finish`, `setup:open-log`, `setup:copy-diagnostics`.

- [ ] **Step 1: Write the failing test** — `setup-ipc.test.ts` asserting the channel-name constants module exists and is consistent:

```ts
import { describe, expect, it } from 'vitest';
import { SETUP_CHANNELS } from './setup-ipc';

describe('setup IPC contract', () => {
  it('defines all channels with the setup: prefix', () => {
    const values = Object.values(SETUP_CHANNELS);
    expect(values).toHaveLength(7);
    for (const v of values) expect(v).toMatch(/^setup:/);
    expect(new Set(values).size).toBe(7);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement.** Create `ds5-bridge/companion/src/main/setup-ipc.ts`:

```ts
export const SETUP_CHANNELS = {
  getPlan: 'setup:get-plan',
  install: 'setup:install',
  progress: 'setup:progress',
  skip: 'setup:skip',
  finish: 'setup:finish',
  openLog: 'setup:open-log',
  copyDiagnostics: 'setup:copy-diagnostics',
} as const;
```

In `preload.ts`, after the existing `contextBridge.exposeInMainWorld('bridge', api);` add:

```ts
import { SETUP_CHANNELS } from './main/setup-ipc';

const setupApi = {
  getPlan: () => ipcRenderer.invoke(SETUP_CHANNELS.getPlan),
  install: () => ipcRenderer.invoke(SETUP_CHANNELS.install),
  onProgress: (cb: (e: unknown) => void) => {
    const listener = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(SETUP_CHANNELS.progress, listener as never);
    return () => ipcRenderer.removeListener(SETUP_CHANNELS.progress, listener as never);
  },
  skip: () => ipcRenderer.invoke(SETUP_CHANNELS.skip),
  finish: () => ipcRenderer.invoke(SETUP_CHANNELS.finish),
  openLog: () => ipcRenderer.invoke(SETUP_CHANNELS.openLog),
  copyDiagnostics: () => ipcRenderer.invoke(SETUP_CHANNELS.copyDiagnostics),
};
contextBridge.exposeInMainWorld('setup', setupApi);
```

In `global.d.ts` add the `setup: SetupApi` declaration mirroring the interface above (import the event type from `../main/setup-service`).

- [ ] **Step 4: Run to verify PASS** + typecheck.
- [ ] **Step 5: Commit** — `git commit -am "feat(companion): setup IPC contract and preload API"`

---

### Task 7: Wizard renderer UI

**Files:**
- Create: `ds5-bridge/companion/src/renderer/SetupWizard.tsx`
- Modify: `ds5-bridge/companion/src/renderer/main.tsx` (route on `?setup=1`)
- Test: `ds5-bridge/companion/src/renderer/setup-wizard.test.ts`

**Interfaces:**
- Consumes: `window.setup` (Task 6 API). Styling follows `UI_STYLE_GUIDE.md` tokens/classes already used in `App.tsx`/`styles.css` — reuse existing button/card classes; add a `.setup-*` block at the end of `styles.css`.
- Produces: `SetupWizard` React component with internal state machine `welcome → review → progress → done | error | reboot`; pure helper `reduceProgress(state, event)` exported for tests.

- [ ] **Step 1: Write the failing test** — test the pure reducer, not the DOM:

```ts
import { describe, expect, it } from 'vitest';
import { initialProgress, reduceProgress } from './SetupWizard';

describe('setup progress reducer', () => {
  it('tracks plan then per-step status', () => {
    let s = reduceProgress(initialProgress, { event: 'plan', total: 2, steps: ['a', 'b'], log: '/l' });
    expect(s.steps).toEqual([{ desc: 'a', status: 'pending' }, { desc: 'b', status: 'pending' }]);
    s = reduceProgress(s, { event: 'step', index: 0, status: 'start' });
    expect(s.steps[0].status).toBe('running');
    s = reduceProgress(s, { event: 'step', index: 0, status: 'ok' });
    s = reduceProgress(s, { event: 'step', index: 1, status: 'fail', exit: 4 });
    expect(s.steps[1].status).toBe('failed');
    expect(s.logPath).toBe('/l');
  });
  it('maps done exit codes to outcomes', () => {
    expect(reduceProgress(initialProgress, { event: 'done', exit: 0 }).outcome).toBe('success');
    expect(reduceProgress(initialProgress, { event: 'done', exit: 6 }).outcome).toBe('reboot');
    expect(reduceProgress(initialProgress, { event: 'done', exit: 4 }).outcome).toBe('error');
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `SetupWizard.tsx`:**

```tsx
import React, { useEffect, useState } from 'react';
import type { SetupProgressEvent } from '../main/setup-service';

type StepState = { desc: string; status: 'pending' | 'running' | 'done' | 'failed' };
export type ProgressState = {
  steps: StepState[];
  logPath: string | null;
  outcome: 'pending' | 'success' | 'reboot' | 'error';
};
export const initialProgress: ProgressState = { steps: [], logPath: null, outcome: 'pending' };

export function reduceProgress(state: ProgressState, e: SetupProgressEvent): ProgressState {
  switch (e.event) {
    case 'plan':
      return { ...state, logPath: e.log, steps: e.steps.map((desc) => ({ desc, status: 'pending' })) };
    case 'step': {
      const steps = state.steps.map((s, i) =>
        i === e.index
          ? { ...s, status: e.status === 'start' ? 'running' : e.status === 'ok' ? 'done' : 'failed' }
          : s,
      ) as StepState[];
      return { ...state, steps };
    }
    case 'done':
      return { ...state, outcome: e.exit === 0 ? 'success' : e.exit === 6 ? 'reboot' : 'error' };
  }
}

type Screen = 'welcome' | 'review' | 'progress';

export function SetupWizard() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [plan, setPlan] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(initialProgress);

  useEffect(() => window.setup.onProgress((e) => setProgress((s) => reduceProgress(s, e))), []);

  const toReview = async () => {
    const res = await window.setup.getPlan();
    if ('unsupported' in res) setUnsupported(res.unsupported);
    else setPlan(res.steps);
    setScreen('review');
  };
  const startInstall = () => {
    setScreen('progress');
    void window.setup.install();
  };

  return (
    <div className="setup-window">
      {screen === 'welcome' && (
        <section className="setup-card">
          <h1>Welcome to OpenDS5</h1>
          <p>
            To bridge your DualSense over Bluetooth with full haptics, OpenDS5 installs a kernel
            module and a background service. This needs your administrator password once.
          </p>
          <div className="setup-actions">
            <button className="primary" onClick={() => void toReview()}>Set up</button>
            <button onClick={() => void window.setup.skip()}>Skip for now</button>
          </div>
        </section>
      )}
      {screen === 'review' && (
        <section className="setup-card">
          <h1>{unsupported ? 'Unsupported distribution' : 'Ready to install'}</h1>
          {unsupported ? (
            <p>{unsupported}</p>
          ) : (
            <ol className="setup-plan">{plan.map((s) => <li key={s}>{s}</li>)}</ol>
          )}
          <div className="setup-actions">
            {!unsupported && <button className="primary" onClick={startInstall}>Install</button>}
            <button onClick={() => void window.setup.skip()}>
              {unsupported ? 'Continue without install' : 'Skip for now'}
            </button>
          </div>
        </section>
      )}
      {screen === 'progress' && (
        <section className="setup-card">
          <h1>
            {progress.outcome === 'pending' && 'Installing…'}
            {progress.outcome === 'success' && 'All set!'}
            {progress.outcome === 'reboot' && 'Reboot required'}
            {progress.outcome === 'error' && 'Something went wrong'}
          </h1>
          <ul className="setup-steps">
            {progress.steps.map((s) => (
              <li key={s.desc} data-status={s.status}>{s.desc}</li>
            ))}
          </ul>
          {progress.outcome === 'success' && (
            <>
              <p>Log out and back in once so group permissions apply to game input features.</p>
              <button className="primary" onClick={() => void window.setup.finish()}>Open OpenDS5</button>
            </>
          )}
          {progress.outcome === 'reboot' && (
            <>
              <p>
                Your Secure Boot key was enrolled. Reboot, choose “Enroll MOK” in the blue screen,
                and the driver loads automatically. You can use the app after that.
              </p>
              <button className="primary" onClick={() => void window.setup.finish()}>Close</button>
            </>
          )}
          {progress.outcome === 'error' && (
            <>
              <p>The install failed. The full log has details{progress.logPath ? ` (${progress.logPath})` : ''}.</p>
              <div className="setup-actions">
                <button className="primary" onClick={startInstall}>Retry</button>
                <button onClick={() => void window.setup.openLog()}>Open log</button>
                <button onClick={() => void window.setup.copyDiagnostics()}>Copy diagnostics</button>
                <button onClick={() => void window.setup.skip()}>Skip for now</button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
```

In `main.tsx`, render `SetupWizard` instead of `App` when `new URLSearchParams(location.search).has('setup')` (match the file's existing render call shape). Append `.setup-window/.setup-card/.setup-plan/.setup-steps/.setup-actions` styles to `styles.css` reusing the app's existing CSS variables (colors, radii, button classes per `UI_STYLE_GUIDE.md`); steps get status glyphs via `li[data-status="done"]::before` etc.

- [ ] **Step 4: Run to verify PASS** (`npx vitest run src/renderer/setup-wizard.test.ts`) + typecheck + `npx vitest run src` all green.
- [ ] **Step 5: Commit** — `git commit -am "feat(companion): setup wizard renderer (welcome/review/progress/done)"`

---

### Task 8: Main-process wiring

**Files:**
- Modify: `ds5-bridge/companion/src/main/main.ts`
- Modify: `ds5-bridge/companion/src/main/settings-store.ts` (add `setupSkipped?: boolean` to settings shape + default `false`)
- Test: `ds5-bridge/companion/src/main/setup-window.test.ts`

**Interfaces:**
- Consumes: `SetupService`, `isSetupNeeded`, `SETUP_CHANNELS`, settings store.
- Produces: `shouldShowSetupWizard(opts: { platform: string; needed: boolean; skipped: boolean }): boolean` (exported pure helper) — true only when `platform === 'linux' && needed && !skipped`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { shouldShowSetupWizard } from './setup-window';

describe('shouldShowSetupWizard', () => {
  it('only on linux, when needed, and not skipped', () => {
    expect(shouldShowSetupWizard({ platform: 'linux', needed: true, skipped: false })).toBe(true);
    expect(shouldShowSetupWizard({ platform: 'win32', needed: true, skipped: false })).toBe(false);
    expect(shouldShowSetupWizard({ platform: 'linux', needed: false, skipped: false })).toBe(false);
    expect(shouldShowSetupWizard({ platform: 'linux', needed: true, skipped: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement.** Create `ds5-bridge/companion/src/main/setup-window.ts` with the pure helper plus the window/IPC glue:

```ts
import { BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import { SETUP_CHANNELS } from './setup-ipc';
import { SetupService } from './setup-service';

export function shouldShowSetupWizard(opts: {
  platform: string;
  needed: boolean;
  skipped: boolean;
}): boolean {
  return opts.platform === 'linux' && opts.needed && !opts.skipped;
}

export function openSetupWindow(opts: {
  service: SetupService;
  indexUrl: string;              // same URL/file the main window loads, + ?setup=1
  preloadPath: string;
  onSkip: () => void;            // persist skip + open main window
  onFinish: () => void;          // open main window
}): BrowserWindow {
  const win = new BrowserWindow({
    width: 720,
    height: 480,
    resizable: false,
    frame: false,
    webPreferences: { preload: opts.preloadPath, contextIsolation: true },
  });
  let logPath: string | null = null;

  ipcMain.handle(SETUP_CHANNELS.getPlan, async () => {
    try {
      const out = await opts.service.dryRunPlan();
      const steps = out
        .split('\n')
        .filter((l) => /^ {2}\d+\. /.test(l))
        .map((l) => l.replace(/^ {2}\d+\. /, ''));
      return { steps };
    } catch (err) {
      return { unsupported: String(err instanceof Error ? err.message : err) };
    }
  });
  ipcMain.handle(SETUP_CHANNELS.install, async () => {
    await opts.service.install((e) => {
      if (e.event === 'plan') logPath = e.log;
      win.webContents.send(SETUP_CHANNELS.progress, e);
    });
  });
  ipcMain.handle(SETUP_CHANNELS.skip, () => {
    opts.onSkip();
    win.close();
  });
  ipcMain.handle(SETUP_CHANNELS.finish, () => {
    opts.onFinish();
    win.close();
  });
  ipcMain.handle(SETUP_CHANNELS.openLog, () => {
    if (logPath) void shell.openPath(logPath);
  });
  ipcMain.handle(SETUP_CHANNELS.copyDiagnostics, () => {
    let tail = '';
    if (logPath && fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8').split('\n');
      tail = lines.slice(-80).join('\n');
    }
    clipboard.writeText(`OpenDS5 install diagnostics\n${tail}`);
  });
  win.on('closed', () => {
    for (const ch of Object.values(SETUP_CHANNELS)) ipcMain.removeHandler(ch);
  });
  return win;
}
```

Also in this task (spec requirements):

- **Finish-setup pill:** when `setupSkipped` is true and setup is still needed, the main window shows a persistent pill. Reuse the app's existing toast/banner mechanism (`BridgeToast` in `bridge-service.ts`): on main-window creation send a sticky toast "System setup incomplete — click to finish" whose action IPC (`setup:reopen`) closes the main window and opens the setup window (add `reopen: 'setup:reopen'` to `SETUP_CHANNELS`, making the Task 6 count test expect 8).
- **NixOS in the GUI:** `SetupWizard`'s review screen: when any plan step mentions `opends5-vds.nix`, render the instructions text with a "Copy plan" button (`navigator.clipboard.writeText(plan.join('\n'))`) instead of the Install button — NixOS never escalates.

In `main.ts` inside `app.whenReady`, before the main window is created: read `setupSkipped` from the settings store, compute `isSetupNeeded()`, and when `shouldShowSetupWizard({...})` open the setup window instead, with `onSkip` persisting `setupSkipped: true` then creating the main window, `onFinish` creating the main window. Resolve `installerPath` via the existing `resolveInstallerPath(process.resourcesPath)` with a dev fallback to `<repo>/installer/opends5-install` when the resources copy doesn't exist. In `settings-store.ts`, add `setupSkipped: boolean` with default `false` following the file's existing default-field pattern.

- [ ] **Step 4: Run to verify PASS** — new test + full `npx vitest run src` + typecheck.
- [ ] **Step 5: Commit** — `git commit -am "feat(companion): show setup wizard on first launch before main window"`

---

### Task 9: End-to-end validation + docs

**Files:**
- Modify: `docs/INSTALLER.md` (userspace phase, JSON protocol, log locations, wizard section)
- Modify: `README.md` (system-setup section: wizard is now the default path)

- [ ] **Step 1: Full suites** — `bash installer/tests/run-tests.sh` and `cd ds5-bridge/companion && npm run typecheck && npx vitest run src` → all green.
- [ ] **Step 2: Local bundle + dev-mode wizard run** — `bash scripts/collect-vds-bin.sh`, then `cd ds5-bridge/companion && npm run dev` with `vdsd.service` stopped: wizard appears, plan lists kernel-skip + userspace steps, install runs with one polkit prompt, done screen, main window opens, `systemctl is-active vdsd` = active. Capture a screenshot of each wizard screen for the PR.
- [ ] **Step 3: Update docs** — INSTALLER.md gains: "Userspace phase" step list, `--json-progress` event table (plan/step/done fields), log locations (`/var/log/opends5/install.log`, `~/.local/state/opends5/install.log`), "Setup wizard" section (first-launch behavior, Skip persistence). README's system-setup paragraph now leads with "first launch opens a setup wizard" and keeps `--install-system` as the CLI alternative.
- [ ] **Step 4: Commit + PR** —

```bash
git add -A && git commit -m "docs: userspace phase, progress protocol, setup wizard"
git push -u origin feature/setup-wizard
gh pr create --base dev --title "Setup wizard + bundled userspace (vdsd/vdsctl)" --body "Implements docs/superpowers/specs/2026-07-11-setup-wizard-design.md ..."
```

- [ ] **Step 5: Hardware validation (user)** — user runs the wizard end-to-end from a built AppImage on the dev box and confirms haptics work after.
