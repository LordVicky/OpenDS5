# OpenDS5 System Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `installer/opends5-install`, an interactive bash installer that prepares any of eight Linux platforms for the `vds_hcd` kernel module (DKMS/akmods, headers, Secure Boot signing/MOK, NixOS config generation), replacing the backend portion of `install-system.sh`.

**Architecture:** One self-contained bash script with pure, environment-injectable detection functions; a plan phase that builds a printable step list; and an execute phase that runs each step via per-step `pkexec`/`sudo` escalation with fail-closed rollback. A dependency-free test harness runs detection and DRY_RUN plan tests against per-platform fixtures.

**Tech Stack:** bash, dkms, akmods, mokutil, electron-builder (bundling only).

## Global Constraints

- All work happens on branch `feature/system-installer` off `dev`.
- Subagents implementing tasks MUST run on Fable 5 or Opus 4.8 only.
- Spec: `docs/superpowers/specs/2026-07-11-system-installer-design.md`. Its "Security & host-safety requirements" section is binding: `set -euo pipefail`, all expansions quoted, no `eval`, no network access, additive-only host changes, root only via the `as_root` helper, `mktemp` for temp files.
- The installer must run under bash 4+; do not use bash 5.1+-only features.
- Files the installer may write on a host: `/usr/src/vds_hcd-<version>/`, DKMS/akmods state, `/var/lib/opends5/` (0700 root), `/etc/modules-load.d/vds.conf`, `/etc/dkms/framework.conf.d/opends5.conf`, and (NixOS) a snippet in the user's CWD.
- Tests must pass with `installer/tests/run-tests.sh` (exit 0) before every commit.
- Version string for the module is read from `vds/module/dkms.conf` `PACKAGE_VERSION` (currently `0.1.0`); never hardcode it elsewhere.

---

### Task 0: Branch + scaffold + test harness

**Files:**
- Create: `installer/opends5-install`
- Create: `installer/tests/harness.sh`
- Create: `installer/tests/run-tests.sh`
- Test: `installer/tests/test-smoke.sh`

**Interfaces:**
- Produces: sourceable script (`OPENDS5_INSTALL_SOURCED=1 source installer/opends5-install` defines functions without running); harness functions `assert_eq <expected> <actual> <label>`, `assert_contains <haystack> <needle> <label>`, `finish` (exits non-zero on any failure).

- [ ] **Step 1: Create branch**

```bash
cd ~/Virtual-DS5-Bridge && git checkout dev && git checkout -b feature/system-installer
```

- [ ] **Step 2: Write the harness and a failing smoke test**

`installer/tests/harness.sh`:
```bash
#!/usr/bin/env bash
# Minimal test harness: no dependencies, used by all installer tests.
set -u
FAILURES=0
TESTS=0
assert_eq() { # expected actual label
  TESTS=$((TESTS + 1))
  if [ "$1" = "$2" ]; then
    printf 'ok   %s\n' "$3"
  else
    printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$3" "$1" "$2"
    FAILURES=$((FAILURES + 1))
  fi
}
assert_contains() { # haystack needle label
  TESTS=$((TESTS + 1))
  case "$1" in
    *"$2"*) printf 'ok   %s\n' "$3" ;;
    *)
      printf 'FAIL %s\n  missing:  %s\n  in:       %s\n' "$3" "$2" "$1"
      FAILURES=$((FAILURES + 1))
      ;;
  esac
}
finish() {
  printf '%d tests, %d failures\n' "$TESTS" "$FAILURES"
  [ "$FAILURES" -eq 0 ]
}
```

`installer/tests/run-tests.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rc=0
for t in test-*.sh; do
  echo "== $t"
  bash "$t" || rc=1
done
exit "$rc"
```

`installer/tests/test-smoke.sh`:
```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
OPENDS5_INSTALL_SOURCED=1 . "$(dirname "$0")/../opends5-install"
assert_eq "0.1.0" "$(module_version "$(dirname "$0")/../../vds/module/dkms.conf")" "module_version reads dkms.conf"
finish
```

- [ ] **Step 3: Run tests to verify failure**

Run: `bash installer/tests/run-tests.sh`
Expected: FAIL (`opends5-install: No such file or directory` or `module_version: command not found`).

- [ ] **Step 4: Write the script skeleton**

`installer/opends5-install`:
```bash
#!/usr/bin/env bash
# OpenDS5 system installer: prepares the host for the vds_hcd kernel module.
# Spec: docs/superpowers/specs/2026-07-11-system-installer-design.md
set -euo pipefail

# --- injectable environment (tests override these) ---
OS_RELEASE="${OPENDS5_OS_RELEASE:-/etc/os-release}"
KERNEL_RELEASE="${OPENDS5_UNAME_R:-$(uname -r)}"
SYSROOT="${OPENDS5_SYSROOT:-}"           # prefix for /sys, /run, /etc probes
DRY_RUN="${OPENDS5_DRY_RUN:-0}"
ASSUME_YES=0

module_version() { # dkms_conf_path -> version
  sed -n 's/^PACKAGE_VERSION="\(.*\)"/\1/p' "$1"
}

main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes) ASSUME_YES=1 ;;
      --dry-run) DRY_RUN=1 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done
  echo "OpenDS5 system installer (skeleton)"
}

usage() {
  cat <<'EOF'
Usage: opends5-install [--yes] [--dry-run]
Prepares this system for the vds_hcd kernel module.
EOF
}

if [ "${OPENDS5_INSTALL_SOURCED:-0}" != "1" ]; then
  main "$@"
fi
```

Then: `chmod +x installer/opends5-install installer/tests/*.sh`

- [ ] **Step 5: Run tests to verify pass**

Run: `bash installer/tests/run-tests.sh`
Expected: `ok   module_version reads dkms.conf`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add installer && git commit -m "feat(installer): scaffold opends5-install with test harness"
```

---

### Task 1: Platform detection

**Files:**
- Modify: `installer/opends5-install` (add functions below `module_version`)
- Create: `installer/tests/fixtures/<p>/os-release` for p in `fedora fedora-cachyos bazzite arch cachyos debian suse nixos`
- Test: `installer/tests/test-detect.sh`

**Interfaces:**
- Produces:
  - `detect_platform` → echoes one of `fedora fedora-immutable arch debian suse nixos unsupported` (reads `$OS_RELEASE`, `$SYSROOT`)
  - `detect_kernel_flavor` → echoes flavor token from `$KERNEL_RELEASE`: `cachyos zen lts hardened rt generic`
  - `headers_package <platform> <flavor>` → echoes the package name providing kernel headers
  - `detect_clang_lto` → echoes `1`/`0` by grepping `CONFIG_LTO_CLANG=y` in `${SYSROOT}/usr/lib/modules/${KERNEL_RELEASE}/build/.config` (missing file → `0`)

- [ ] **Step 1: Write fixtures**

Each fixture is a real minimal os-release. Examples (create all eight):

`installer/tests/fixtures/fedora/os-release`:
```
ID=fedora
VERSION_ID=44
```
`installer/tests/fixtures/bazzite/os-release`:
```
ID=bazzite
ID_LIKE="fedora"
VARIANT_ID=bazzite
```
`installer/tests/fixtures/cachyos/os-release`:
```
ID=cachyos
ID_LIKE="arch"
```
`installer/tests/fixtures/arch/os-release`: `ID=arch`
`installer/tests/fixtures/debian/os-release`: `ID=ubuntu` + `ID_LIKE=debian`
`installer/tests/fixtures/suse/os-release`: `ID=opensuse-tumbleweed` + `ID_LIKE="opensuse suse"`
`installer/tests/fixtures/nixos/os-release`: `ID=nixos`
`installer/tests/fixtures/fedora-cachyos/os-release`: same as fedora (COPR kernel changes uname, not os-release).

For immutable detection, tests create `"$tmp/run/ostree-booted"` under a SYSROOT tempdir.

- [ ] **Step 2: Write the failing test**

`installer/tests/test-detect.sh`:
```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
OPENDS5_INSTALL_SOURCED=1 . "$here/../opends5-install"

probe() { # fixture uname_r [sysroot] -> platform
  OS_RELEASE="$here/fixtures/$1/os-release" KERNEL_RELEASE="$2" SYSROOT="${3:-/nonexistent}" detect_platform
}

assert_eq fedora            "$(probe fedora 6.15.4-200.fc44.x86_64)"          "fedora"
assert_eq fedora            "$(probe fedora-cachyos 7.1.2-cachyos1.fc44.x86_64)" "fedora + COPR kernel"
tmp="$(mktemp -d)"; mkdir -p "$tmp/run"; : > "$tmp/run/ostree-booted"
assert_eq fedora-immutable  "$(probe bazzite 6.15.4-104.bazzite.fc44.x86_64 "$tmp")" "bazzite immutable"
rm -rf "$tmp"
assert_eq arch              "$(probe arch 6.15.4-arch1-1)"                    "arch"
assert_eq arch              "$(probe cachyos 6.15.4-2-cachyos)"               "cachyos -> arch family"
assert_eq debian            "$(probe debian 6.8.0-41-generic)"                "ubuntu -> debian family"
assert_eq suse              "$(probe suse 6.15.4-1-default)"                  "opensuse"
assert_eq nixos             "$(probe nixos 6.15.4)"                           "nixos"

assert_eq cachyos "$(KERNEL_RELEASE=6.15.4-2-cachyos detect_kernel_flavor)"   "flavor cachyos"
assert_eq zen     "$(KERNEL_RELEASE=6.15.4-zen1-1-zen detect_kernel_flavor)"  "flavor zen"
assert_eq generic "$(KERNEL_RELEASE=6.8.0-41-generic detect_kernel_flavor)"   "flavor generic"

assert_eq linux-cachyos-headers "$(headers_package arch cachyos)"   "arch cachyos headers"
assert_eq linux-zen-headers     "$(headers_package arch zen)"       "arch zen headers"
assert_eq linux-headers         "$(headers_package arch generic)"   "arch stock headers"
assert_eq kernel-cachyos-devel  "$(headers_package fedora cachyos)" "fedora COPR headers"
assert_eq kernel-devel          "$(headers_package fedora generic)" "fedora headers"
assert_eq "linux-headers-6.8.0-41-generic" "$(KERNEL_RELEASE=6.8.0-41-generic headers_package debian generic)" "debian headers"
assert_eq kernel-default-devel  "$(headers_package suse generic)"   "suse headers"
finish
```

- [ ] **Step 3: Run to verify FAIL** — `bash installer/tests/run-tests.sh` → `detect_platform: command not found`.

- [ ] **Step 4: Implement detection functions** (add to `installer/opends5-install`):

```bash
os_release_val() { # key -> value (unquoted), empty if absent
  sed -n "s/^$1=//p" "$OS_RELEASE" 2>/dev/null | tr -d '"' | head -n1
}

detect_platform() {
  local id like
  id="$(os_release_val ID)"
  like="$(os_release_val ID_LIKE)"
  if [ "$id" = "nixos" ]; then echo nixos; return; fi
  case " $id $like " in
    *" fedora "*)
      if [ -e "${SYSROOT}/run/ostree-booted" ]; then echo fedora-immutable; else echo fedora; fi ;;
    *" arch "*)   echo arch ;;
    *" debian "*|*" ubuntu "*) echo debian ;;
    *" suse "*|*" opensuse "*) echo suse ;;
    *) echo unsupported ;;
  esac
}

detect_kernel_flavor() {
  case "$KERNEL_RELEASE" in
    *cachyos*)  echo cachyos ;;
    *zen*)      echo zen ;;
    *hardened*) echo hardened ;;
    *-rt*)      echo rt ;;
    *lts*)      echo lts ;;
    *)          echo generic ;;
  esac
}

headers_package() { # platform flavor
  local platform="$1" flavor="$2"
  case "$platform" in
    arch)
      case "$flavor" in
        generic) echo linux-headers ;;
        *)       echo "linux-${flavor}-headers" ;;
      esac ;;
    fedora|fedora-immutable)
      case "$flavor" in
        cachyos) echo kernel-cachyos-devel ;;
        *)       echo kernel-devel ;;
      esac ;;
    debian) echo "linux-headers-${KERNEL_RELEASE}" ;;
    suse)   echo kernel-default-devel ;;
    *)      echo "" ;;
  esac
}

detect_clang_lto() {
  local cfg="${SYSROOT}/usr/lib/modules/${KERNEL_RELEASE}/build/.config"
  if grep -qs '^CONFIG_LTO_CLANG=y' "$cfg"; then echo 1; else echo 0; fi
}
```

- [ ] **Step 5: Run to verify PASS** — `bash installer/tests/run-tests.sh` → all ok, exit 0.

- [ ] **Step 6: Commit** — `git add installer && git commit -m "feat(installer): platform, kernel-flavor and headers detection"`

---

### Task 2: Secure Boot / lockdown / enforcement detection

**Files:**
- Modify: `installer/opends5-install`
- Test: `installer/tests/test-secureboot.sh`

**Interfaces:**
- Produces:
  - `detect_lockdown` → echoes `none integrity confidentiality` token that is bracketed in `${SYSROOT}/sys/kernel/security/lockdown` (missing file → `none`)
  - `detect_secureboot` → `1`/`0`; honors override `OPENDS5_SB_STATE` (values `enabled`/`disabled`) for tests, else parses `mokutil --sb-state`, missing mokutil → `0`
  - `detect_sig_enforced` → `1` when lockdown != none OR kernel config has `CONFIG_MODULE_SIG_FORCE=y`, else `0`

- [ ] **Step 1: Write the failing test**

`installer/tests/test-secureboot.sh`:
```bash
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
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement:**

```bash
detect_lockdown() {
  local f="${SYSROOT}/sys/kernel/security/lockdown"
  [ -r "$f" ] || { echo none; return; }
  sed -n 's/.*\[\(.*\)\].*/\1/p' "$f"
}

detect_secureboot() {
  if [ -n "${OPENDS5_SB_STATE:-}" ]; then
    [ "$OPENDS5_SB_STATE" = "enabled" ] && echo 1 || echo 0
    return
  fi
  if command -v mokutil >/dev/null 2>&1 && mokutil --sb-state 2>/dev/null | grep -q 'SecureBoot enabled'; then
    echo 1
  else
    echo 0
  fi
}

detect_sig_enforced() {
  if [ "$(detect_lockdown)" != "none" ]; then echo 1; return; fi
  local cfg="${SYSROOT}/usr/lib/modules/${KERNEL_RELEASE}/build/.config"
  if grep -qs '^CONFIG_MODULE_SIG_FORCE=y' "$cfg"; then echo 1; else echo 0; fi
}
```

- [ ] **Step 4: Run to verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(installer): secure boot, lockdown and enforcement detection"`

---

### Task 3: Plan builder (per-platform command lists)

**Files:**
- Modify: `installer/opends5-install`
- Test: `installer/tests/test-plan.sh`

**Interfaces:**
- Consumes: all Task 1–2 detection functions.
- Produces:
  - Global arrays `PLAN_DESC=()` and `PLAN_CMD=()` (parallel; `PLAN_CMD[i]` is a single shell-safe command line executed via `as_root bash -c`).
  - `plan_add <desc> <cmd>` appender.
  - `build_plan` → fills the arrays for the detected platform. Echoes nothing; sets `PLAN_FATAL` to a message for `unsupported`, and `PLAN_NIXOS=1` for nixos (plan contains only the snippet-generation step, which is unprivileged).
  - `print_plan` → numbered human-readable list; with `DRY_RUN=1`, `main` prints `PLAN_CMD` lines verbatim after the list and exits 0 (this is what tests assert on).
  - `MODULE_SRC` (resolved vds module source dir) and `MODULE_VER` globals set by `resolve_module_source`, which prefers `${APPDIR:-}/resources/vds-module` then `<script_dir>/../vds/module`.

- [ ] **Step 1: Write the failing test**

`installer/tests/test-plan.sh`:
```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"

plan_for() { # fixture uname_r extra_env... -> dry-run output
  local fixture="$1" uname_r="$2"; shift 2
  env "$@" OPENDS5_OS_RELEASE="$here/fixtures/$fixture/os-release" \
      OPENDS5_UNAME_R="$uname_r" OPENDS5_SYSROOT=/nonexistent \
      OPENDS5_SB_STATE=disabled OPENDS5_DRY_RUN=1 \
      bash "$here/../opends5-install" --yes
}

out="$(plan_for fedora 6.15.4-200.fc44.x86_64)"
assert_contains "$out" "dnf install -y dkms kernel-devel" "fedora installs dkms+devel"
assert_contains "$out" "dkms install vds_hcd/0.1.0"       "fedora dkms install"
assert_contains "$out" "/usr/src/vds_hcd-0.1.0"           "fedora stages source"
assert_contains "$out" "modules-load.d/vds.conf"          "fedora autoload"

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
assert_contains "$out" "rpm-ostree install --idempotent akmods kernel-devel" "bazzite layers akmods"
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
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement plan builder** (add to script; replace skeleton `main` body's trailing echo):

```bash
PLAN_DESC=()
PLAN_CMD=()
PLAN_FATAL=""
PLAN_NIXOS=0
MODULE_SRC=""
MODULE_VER=""

plan_add() { PLAN_DESC+=("$1"); PLAN_CMD+=("$2"); }

resolve_module_source() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  for cand in "${APPDIR:-/nonexistent}/resources/vds-module" "$script_dir/../vds/module"; do
    if [ -f "$cand/dkms.conf" ]; then
      MODULE_SRC="$cand"
      MODULE_VER="$(module_version "$cand/dkms.conf")"
      return
    fi
  done
  echo "error: vds module source not found (looked in AppImage resources and repo)" >&2
  exit 1
}

plan_source_staging() {
  local dest="/usr/src/vds_hcd-${MODULE_VER}"
  plan_add "Stage module source to ${dest}" \
    "mkdir -p '${dest}' && cp -a '${MODULE_SRC}/.' '${dest}/' && find '${dest}' -name '*.o' -delete"
}

plan_dkms() {
  local mk=""
  [ "$(detect_clang_lto)" = "1" ] && mk=" LLVM=1"
  plan_add "Register and build vds_hcd with DKMS" \
    "dkms add vds_hcd/${MODULE_VER} || true; dkms install vds_hcd/${MODULE_VER}${mk:+ }${mk# }"
  plan_add "Enable autoload on boot" \
    "printf 'vds_hcd\n' > /etc/modules-load.d/vds.conf"
}

build_plan() {
  local platform flavor hdrs
  platform="$(detect_platform)"
  flavor="$(detect_kernel_flavor)"
  hdrs="$(headers_package "$platform" "$flavor")"
  case "$platform" in
    fedora)
      plan_add "Install DKMS and kernel headers (dnf)" "dnf install -y dkms ${hdrs}"
      plan_source_staging; plan_dkms ;;
    fedora-immutable)
      plan_add "Layer akmods + headers (rpm-ostree; REBOOT REQUIRED before module build)" \
        "rpm-ostree install --idempotent akmods ${hdrs}"
      plan_add "After reboot, re-run this installer to build the module" \
        "echo 'reboot, then run: opends5-install'"
      plan_source_staging; plan_dkms ;;
    arch)
      plan_add "Install DKMS and kernel headers (pacman)" "pacman -S --needed --noconfirm dkms ${hdrs}"
      plan_source_staging; plan_dkms ;;
    debian)
      plan_add "Install DKMS and kernel headers (apt)" "apt-get install -y dkms ${hdrs}"
      plan_source_staging; plan_dkms ;;
    suse)
      plan_add "Install DKMS and kernel headers (zypper)" "zypper --non-interactive install dkms ${hdrs}"
      plan_source_staging; plan_dkms ;;
    nixos)
      PLAN_NIXOS=1
      plan_add "Generate NixOS module snippet (no system changes)" "generate_nixos_snippet" ;;
    *)
      PLAN_FATAL="This distribution is unsupported by the automatic installer.
See docs/PORTING.md for manual installation instructions." ;;
  esac
}

print_plan() {
  local i
  echo "The following steps will be performed:"
  for i in "${!PLAN_DESC[@]}"; do
    printf '  %d. %s\n' "$((i + 1))" "${PLAN_DESC[$i]}"
  done
}
```

New `main`:
```bash
main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes) ASSUME_YES=1 ;;
      --dry-run) DRY_RUN=1 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done
  resolve_module_source
  build_plan
  if [ -n "$PLAN_FATAL" ]; then echo "unsupported: $PLAN_FATAL" >&2; exit 3; fi
  plan_secureboot   # added in Task 5; define as no-op `plan_secureboot() { :; }` for now
  print_plan
  if [ "$DRY_RUN" = "1" ]; then
    printf '%s\n' "${PLAN_CMD[@]}"
    exit 0
  fi
  confirm_and_execute   # added in Task 4; stub `confirm_and_execute() { :; }` for now
}
```
Also add the two stubs (`plan_secureboot() { :; }`, `confirm_and_execute() { :; }`) and a placeholder `generate_nixos_snippet() { echo "would write ./opends5-vds.nix"; }` so the nixos plan line mentions `opends5-vds.nix`.

- [ ] **Step 4: Run to verify PASS** (all three test files).
- [ ] **Step 5: Commit** — `git commit -am "feat(installer): per-platform plan builder with dry-run output"`

---

### Task 4: Execution engine (escalation, confirm, fail-closed, verify)

**Files:**
- Modify: `installer/opends5-install` (replace `confirm_and_execute` stub)
- Test: `installer/tests/test-execute.sh`

**Interfaces:**
- Consumes: `PLAN_DESC`/`PLAN_CMD`, `MODULE_VER`.
- Produces:
  - `as_root <cmd...>`: runs directly if EUID 0; else `pkexec` if available and `$DISPLAY`/`$WAYLAND_DISPLAY` set; else `sudo`. Honors `OPENDS5_ROOT_CMD` override (tests set it to a stub).
  - `confirm_and_execute`: prompts `Proceed? [Y/n]` (skipped with `--yes`), runs each `PLAN_CMD[i]` via `as_root bash -c`, prints `==> desc` before and `FAILED` diagnostics on error, rolls back (`dkms remove vds_hcd/${MODULE_VER} --all`) and exits 4 on failure; on success runs `verify_install`.
  - `verify_install`: `as_root modprobe vds_hcd`, checks a `/dev/vds*` node exists, prints summary. Skipped for `PLAN_NIXOS=1`.

- [ ] **Step 1: Write the failing test**

`installer/tests/test-execute.sh`:
```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"

# root stub: logs commands; fails when the log contains the word FAILME
cat > "$tmp/rootstub" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "$ROOTLOG"
case "$*" in *FAILME*) exit 1 ;; esac
exit 0
EOF
chmod +x "$tmp/rootstub"

run_exec() { # extra installer env...
  env "$@" ROOTLOG="$tmp/log" OPENDS5_ROOT_CMD="$tmp/rootstub" \
      OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
      OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT=/nonexistent \
      OPENDS5_SB_STATE=disabled OPENDS5_SKIP_VERIFY=1 \
      bash "$here/../opends5-install" --yes
}

: > "$tmp/log"
run_exec
assert_contains "$(cat "$tmp/log")" "dnf install -y dkms kernel-devel" "steps executed via root helper"
assert_contains "$(cat "$tmp/log")" "dkms install vds_hcd/0.1.0" "dkms step executed"

# failure rolls back and exits 4
: > "$tmp/log"
if OPENDS5_FAIL_MARKER=1 env ROOTLOG="$tmp/log" OPENDS5_ROOT_CMD="$tmp/rootstub" \
    OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 \
    OPENDS5_SYSROOT=/nonexistent OPENDS5_SB_STATE=disabled OPENDS5_SKIP_VERIFY=1 \
    OPENDS5_TEST_INJECT_FAIL=FAILME bash "$here/../opends5-install" --yes; then
  assert_eq "exit-nonzero" "exit-zero" "failed step must exit non-zero"
else
  assert_eq 4 $? "exit code 4 on step failure"
fi
assert_contains "$(cat "$tmp/log")" "dkms remove vds_hcd/0.1.0 --all" "rollback ran"
rm -rf "$tmp"
finish
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement** (replace stub; also, when `OPENDS5_TEST_INJECT_FAIL` is set, `build_plan`'s first `plan_add` call gets an extra injected step — implement by appending `plan_add "test-injected failure" "$OPENDS5_TEST_INJECT_FAIL"` at the end of `build_plan` when the variable is non-empty):

```bash
as_root() {
  if [ -n "${OPENDS5_ROOT_CMD:-}" ]; then "$OPENDS5_ROOT_CMD" "$@"; return; fi
  if [ "$(id -u)" -eq 0 ]; then "$@"; return; fi
  if command -v pkexec >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    pkexec "$@"
  else
    sudo "$@"
  fi
}

rollback() {
  echo "Rolling back partial DKMS registration..." >&2
  as_root bash -c "dkms remove vds_hcd/${MODULE_VER} --all || true"
}

confirm_and_execute() {
  if [ "$ASSUME_YES" != "1" ]; then
    printf 'Proceed? [Y/n] '
    read -r reply
    case "$reply" in n|N|no|NO) echo "Aborted."; exit 0 ;; esac
  fi
  local i
  for i in "${!PLAN_CMD[@]}"; do
    echo "==> ${PLAN_DESC[$i]}"
    if [ "${PLAN_CMD[$i]}" = "generate_nixos_snippet" ]; then
      generate_nixos_snippet; continue
    fi
    if ! as_root bash -c "${PLAN_CMD[$i]}"; then
      echo "FAILED: ${PLAN_DESC[$i]}" >&2
      echo "  command: ${PLAN_CMD[$i]}" >&2
      echo "  Retry manually with: sudo bash -c '${PLAN_CMD[$i]}'" >&2
      echo "  Troubleshooting: https://github.com/LordVicky/OpenDS5/blob/main/docs/PORTING.md" >&2
      rollback
      exit 4
    fi
  done
  [ "$PLAN_NIXOS" = "1" ] && return 0
  [ "${OPENDS5_SKIP_VERIFY:-0}" = "1" ] && { echo "Done (verify skipped)."; return 0; }
  verify_install
}

verify_install() {
  echo "==> Verifying"
  as_root modprobe vds_hcd
  if ls /dev/vds* >/dev/null 2>&1; then
    echo "Success: vds_hcd loaded, /dev/vds* present."
  else
    echo "Module loaded but /dev/vds* not found; check 'dmesg | grep vds_hcd'." >&2
    exit 5
  fi
}
```

- [ ] **Step 4: Run to verify PASS** (whole suite).
- [ ] **Step 5: Commit** — `git commit -am "feat(installer): execution engine with pkexec escalation and fail-closed rollback"`

---

### Task 5: Secure Boot signing + MOK enrollment

**Files:**
- Modify: `installer/opends5-install` (replace `plan_secureboot` stub)
- Test: `installer/tests/test-secureboot-plan.sh`

**Interfaces:**
- Consumes: `detect_secureboot`, `detect_sig_enforced`, `plan_add`.
- Produces: `plan_secureboot` appends steps when Secure Boot is on: always configure DKMS signing (key at `/var/lib/opends5/mok.key|mok.der`, dir 0700); additionally run `mokutil --import` + print reboot-enrollment explanation only when `detect_sig_enforced` is `1` and the key isn't already enrolled (`mokutil --test-key` check inside the step command, so it's still one idempotent root step).

- [ ] **Step 1: Write the failing test**

`installer/tests/test-secureboot-plan.sh`:
```bash
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
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement** (replace the stub):

```bash
plan_secureboot() {
  [ "$(detect_secureboot)" = "1" ] || return 0
  local keydir=/var/lib/opends5
  plan_add "Configure DKMS module signing (key: ${keydir}/mok.key)" \
    "mkdir -p -m 0700 '${keydir}' && \
     if [ ! -f '${keydir}/mok.key' ]; then \
       openssl req -new -x509 -newkey rsa:2048 -nodes -days 36500 \
         -subj '/CN=OpenDS5 module signing key/' \
         -keyout '${keydir}/mok.key' -outform DER -out '${keydir}/mok.der'; \
       chmod 0600 '${keydir}/mok.key'; \
     fi && \
     mkdir -p /etc/dkms/framework.conf.d && \
     printf 'mok_signing_key=%s\nmok_certificate=%s\n' \
       '${keydir}/mok.key' '${keydir}/mok.der' \
       > /etc/dkms/framework.conf.d/opends5.conf"
  if [ "$(detect_sig_enforced)" = "1" ]; then
    plan_add "Enroll signing key in MOK (you will set a one-time password; a blue 'MOK Manager' screen appears on next reboot — choose Enroll MOK)" \
      "if mokutil --test-key '${keydir}/mok.der' 2>/dev/null | grep -q 'already enrolled'; then \
         echo 'MOK key already enrolled'; \
       else \
         mokutil --import '${keydir}/mok.der'; \
       fi"
  fi
}
```
Note: `plan_secureboot` must run BEFORE `plan_dkms`'s `dkms install` would matter — order the call in `main` before `print_plan` but insert its steps ahead of the dkms build by calling `plan_secureboot` from within `build_plan` immediately after the package-install `plan_add` for each dkms-based platform (fedora, fedora-immutable, arch, debian, suse) and remove the `plan_secureboot` call from `main`. Signing config must exist before `dkms install` builds/signs the module.

- [ ] **Step 4: Run to verify PASS** (adjust Task 3's test if step ordering output changed — the asserted substrings are order-independent, so no change expected).
- [ ] **Step 5: Commit** — `git commit -am "feat(installer): secure boot signing and conditional MOK enrollment"`

---

### Task 6: NixOS snippet generation

**Files:**
- Modify: `installer/opends5-install` (replace placeholder `generate_nixos_snippet`)
- Test: `installer/tests/test-nixos.sh`

**Interfaces:**
- Consumes: `MODULE_SRC`, `MODULE_VER`.
- Produces: `generate_nixos_snippet` writes `./opends5-vds.nix` (in CWD, unprivileged) containing a `stdenv.mkDerivation` kernel-module package wired into `boot.extraModulePackages`, plus copies module source to `./opends5-vds-src/`, and prints usage instructions.

- [ ] **Step 1: Write the failing test**

`installer/tests/test-nixos.sh`:
```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; cd "$tmp"
env OPENDS5_OS_RELEASE="$here/fixtures/nixos/os-release" OPENDS5_UNAME_R=6.15.4 \
    OPENDS5_SYSROOT=/nonexistent OPENDS5_SB_STATE=disabled \
    bash "$here/../opends5-install" --yes
assert_eq 1 "$([ -f opends5-vds.nix ] && echo 1 || echo 0)" "snippet written"
assert_eq 1 "$([ -f opends5-vds-src/dkms.conf ] && echo 1 || echo 0)" "module source copied"
assert_contains "$(cat opends5-vds.nix)" "boot.extraModulePackages" "wires extraModulePackages"
assert_contains "$(cat opends5-vds.nix)" "vds_hcd" "names the module"
cd /; rm -rf "$tmp"
finish
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement:**

```bash
generate_nixos_snippet() {
  cp -a "$MODULE_SRC" ./opends5-vds-src
  find ./opends5-vds-src -name '*.o' -delete
  cat > ./opends5-vds.nix <<EOF
# OpenDS5 vds_hcd kernel module for NixOS.
# Import from configuration.nix:  imports = [ ./opends5-vds.nix ];
{ config, pkgs, ... }:
let
  kernel = config.boot.kernelPackages.kernel;
  vds_hcd = pkgs.stdenv.mkDerivation {
    pname = "vds_hcd";
    version = "${MODULE_VER}";
    src = ./opends5-vds-src;
    hardeningDisable = [ "pic" ];
    nativeBuildInputs = kernel.moduleBuildDependencies;
    makeFlags = [
      "KERNELRELEASE=\${kernel.modDirVersion}"
      "KDIR=\${kernel.dev}/lib/modules/\${kernel.modDirVersion}/build"
      "INSTALL_MOD_PATH=\$(out)"
    ];
    installPhase = ''
      install -D vds_hcd.ko \$out/lib/modules/\${kernel.modDirVersion}/extra/vds_hcd.ko
    '';
  };
in
{
  boot.extraModulePackages = [ vds_hcd ];
  boot.kernelModules = [ "vds_hcd" ];
}
EOF
  cat <<'EOF'
Wrote ./opends5-vds.nix and ./opends5-vds-src/.
NixOS cannot be modified imperatively; to install:
  1. Move both into your configuration directory.
  2. Add  imports = [ ./opends5-vds.nix ];  to configuration.nix.
  3. Run: sudo nixos-rebuild switch
EOF
}
```

- [ ] **Step 4: Run to verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(installer): nixos module snippet generation"`

---

### Task 7: Wire-up — wrapper script, AppImage bundling, `--install-system`

**Files:**
- Modify: `install-system.sh` (top section only: replace the DKMS `make install`/modprobe/modules-load lines with a call to the installer; keep userspace/service/udev sections unchanged)
- Modify: `ds5-bridge/companion/package.json` (`build.extraResources`)
- Modify: `ds5-bridge/companion/src/main/main.ts` (argv handling)
- Test: `ds5-bridge/companion/src/main/install-system-cli.test.ts`

**Interfaces:**
- Consumes: `installer/opends5-install` CLI (`--yes`, exit codes 0/2/3/4/5).
- Produces: `OpenDS5.AppImage --install-system` runs the bundled installer in the invoking terminal and exits with its code; `shouldRunSystemInstall(argv)` and `resolveInstallerPath(resourcesPath)` exported from a new small module `ds5-bridge/companion/src/main/install-system-cli.ts`.

- [ ] **Step 1: Update `install-system.sh`** — replace the block

```sh
echo "==> kernel module (DKMS) + autoload"
make -C "$repo/vds/module" install
echo vds_hcd > /etc/modules-load.d/vds.conf
modprobe vds_hcd
```
with
```sh
echo "==> kernel module (opends5-install)"
OPENDS5_SKIP_VERIFY=1 bash "$repo/installer/opends5-install" --yes
modprobe vds_hcd
```
(Script already runs as root, so `as_root` executes directly; keep `set -e` semantics.)

- [ ] **Step 2: Write the failing TS test**

`ds5-bridge/companion/src/main/install-system-cli.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveInstallerPath, shouldRunSystemInstall } from './install-system-cli';

describe('install-system CLI', () => {
  it('detects the flag anywhere in argv', () => {
    expect(shouldRunSystemInstall(['electron', '.', '--install-system'])).toBe(true);
    expect(shouldRunSystemInstall(['electron', '.'])).toBe(false);
  });
  it('resolves the bundled installer under resources', () => {
    expect(resolveInstallerPath('/tmp/res')).toBe('/tmp/res/installer/opends5-install');
  });
});
```

- [ ] **Step 3: Run to verify FAIL** — `cd ds5-bridge/companion && npx vitest run src/main/install-system-cli.test.ts` → module not found.

- [ ] **Step 4: Implement**

`ds5-bridge/companion/src/main/install-system-cli.ts`:
```ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function shouldRunSystemInstall(argv: string[]): boolean {
  return argv.includes('--install-system');
}

export function resolveInstallerPath(resourcesPath: string): string {
  return path.join(resourcesPath, 'installer', 'opends5-install');
}

/** Runs the bundled installer attached to the current terminal; returns its exit code. */
export function runSystemInstall(resourcesPath: string, extraArgs: string[] = []): number {
  const result = spawnSync('bash', [resolveInstallerPath(resourcesPath), ...extraArgs], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
}
```

In `ds5-bridge/companion/src/main/main.ts`, near the existing early argv handling (before window creation; see `shouldStartInTray` around line 379 for the pattern), add:
```ts
import { runSystemInstall, shouldRunSystemInstall } from './install-system-cli';
// ...inside app startup, before creating any window:
if (shouldRunSystemInstall(process.argv)) {
  const code = runSystemInstall(process.resourcesPath, process.argv.slice(process.argv.indexOf('--install-system') + 1));
  app.exit(code);
}
```

In `ds5-bridge/companion/package.json` `build.extraResources`, add two entries:
```json
{ "from": "../../installer", "to": "installer" },
{ "from": "../../vds/module", "to": "vds-module",
  "filter": ["**/*", "!*.o", "!*.ko*", "!*.mod*", "!modules.order", "!Module.symvers"] }
```
(`resolve_module_source` already looks in `${APPDIR}/resources/vds-module`; electron-builder's AppImage sets `APPDIR`. Note `resolve_module_source` checks `${APPDIR}/resources/vds-module` — confirm at runtime the AppImage layout is `$APPDIR/resources/`; if electron-builder uses `$APPDIR/usr/... `or similar, adjust the candidate list in `resolve_module_source` to also try `$(dirname script_dir)/vds-module`, which works because the script itself is bundled under `resources/installer/`. Add that second candidate now: `"$script_dir/../vds-module"`.)

- [ ] **Step 5: Run to verify PASS** — vitest test green; `bash installer/tests/run-tests.sh` still green; `npm run typecheck` green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(installer): wire into install-system.sh and AppImage --install-system"`

---

### Task 8: End-to-end validation + docs

**Files:**
- Create: `docs/INSTALLER.md`
- Modify: `README.md` (add an "System setup" paragraph pointing at `--install-system`)

- [ ] **Step 1: Full test suite** — `bash installer/tests/run-tests.sh && (cd ds5-bridge/companion && npm test -- --run 2>/dev/null || npx vitest run src)` → all green.

- [ ] **Step 2: Real dry-run on the dev box** — `bash installer/opends5-install --dry-run --yes` → plan shows fedora + `kernel-cachyos-devel`, signing step present (SB on), NO `mokutil --import` (lockdown none). Paste output into the PR description.

- [ ] **Step 3: Write `docs/INSTALLER.md`** — document: what the installer does per platform (table from the spec), the exit codes (0 ok, 2 usage, 3 unsupported, 4 step failure w/ rollback, 5 verify failure), Secure Boot/MOK behavior, NixOS flow, and the security guarantees (additive-only, per-step escalation, no network).

- [ ] **Step 4: README** — add under installation:
```markdown
### System setup (kernel module)
Run `./OpenDS5.AppImage --install-system` once. It detects your distro,
installs DKMS/akmods + kernel headers, builds and signs the vds_hcd module,
and handles Secure Boot. See docs/INSTALLER.md.
```

- [ ] **Step 5: Commit + PR** —
```bash
git add -A && git commit -m "docs(installer): installer guide and README entry"
git push -u origin feature/system-installer
gh pr create --base dev --title "System installer: multi-distro vds_hcd setup" --body "Implements docs/superpowers/specs/2026-07-11-system-installer-design.md ..."
```

- [ ] **Step 6: Hardware validation (user)** — ask the user to run the installer for real on the dev box (it should be a no-op-ish reinstall: packages present, dkms re-registers, module loads) before merge.
