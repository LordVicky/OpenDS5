# OpenDS5 System Installer — Design

Date: 2026-07-11
Status: Approved

## Goal

An interactive CLI installer that prepares the host system for the `vds_hcd`
kernel module across major Linux distros: installs build prerequisites (DKMS or
akmods, kernel headers), registers and builds the module, handles Secure Boot
signing/enrollment, and verifies the result. Replaces the backend-check portion
of `install-system.sh`.

Out of scope: diagnostics/doctor tooling, uninstall (later `--uninstall-system`),
the GUI itself (it shells out to this installer).

## Shape & entry points

- Single self-contained bash script: `opends5-install`.
- Bundled inside the AppImage, exposed as `OpenDS5.AppImage --install-system`;
  also invoked by the GUI first-run flow.
- `install-system.sh` in the repo becomes a thin wrapper calling the same script.
- Runs as the regular user. Escalates **per step** via `pkexec` (system
  authentication dialog), falling back to `sudo` when no polkit agent is
  present. Never requires being launched as root.

## Flow

1. **Detect** (read-only): distro family (`/etc/os-release`), kernel version +
   flavor (`uname -r` suffix: `-cachyos`, `-zen`, `.fcNN`…), immutable vs
   mutable (`rpm-ostree`, `/nix`), Secure Boot (`mokutil --sb-state`), lockdown
   (`/sys/kernel/security/lockdown`), module signature enforcement, existing
   vds_hcd installation/version.
2. **Plan**: print a numbered list of exactly what will be done on this system.
3. **Confirm once** (`Proceed? [Y/n]`); `--yes` for non-interactive/GUI use.
4. **Execute** steps with progress output and per-step failure messages.
5. **Verify**: `modprobe vds_hcd`, confirm `/dev/vds*` exists, print summary.

## Per-platform strategy

| Platform | Mechanism |
|---|---|
| Fedora (mutable) | Prefer akmods when present, else dkms + `kernel-devel` (or `kernel-cachyos-devel` on COPR kernels) via dnf |
| Arch / CachyOS | dkms + flavor-matched headers (`linux-cachyos-headers`, `linux-zen-headers`, …) via pacman; detect Clang/LTO kernels (`CONFIG_LTO_CLANG`) and build with `LLVM=1` |
| Debian / Ubuntu | dkms + `linux-headers-$(uname -r)` via apt |
| openSUSE | dkms + `kernel-default-devel` via zypper |
| Bazzite / Silverblue | `rpm-ostree install akmods kernel-devel` layering; warn that a reboot is required mid-flow and resume afterwards |
| NixOS | No imperative install. Generate a ready-to-paste NixOS module/flake snippet building `vds_hcd` via `boot.extraModulePackages`, write it to a file, print instructions |
| Anything else | Clean "unsupported" message + manual-install doc link; never a half-applied state |

Module source persistence: the installer copies the bundled vds module source
out of the AppImage into `/usr/src/vds_hcd-<version>/` before `dkms add`, so
DKMS/akmods can rebuild on future kernel updates after the AppImage mount is
gone.

## Secure Boot handling

After registration, determine whether signature enforcement is actually active
(lockdown != none, or `MODULE_SIG_FORCE=y`) — not merely whether Secure Boot is
enabled.

- Enforcement active, no enrolled key: generate a MOK key, configure
  dkms/akmods signing, `mokutil --import`, and explain the MOK enrollment
  screen on next reboot.
- Secure Boot on but enforcement off (e.g. CachyOS kernels without Fedora's
  lockdown patch): sign the module anyway, skip enrollment prompts.

## Security & host-safety requirements

- **Least privilege**: root only for the specific commands that need it
  (package install, file copy to `/usr/src`, dkms/akmod, mokutil, modprobe);
  detection and planning run unprivileged.
- **Additive only**: the installer installs packages and adds files; it never
  removes, overwrites, or modifies existing host configuration, kernel
  parameters, bootloader entries, or other modules. The only files it writes
  are under `/usr/src/vds_hcd-<version>/`, DKMS/akmods state, and its own MOK
  key under `/var/lib/opends5/` (0600, root-owned).
- **No pipes from the network**: everything executed ships inside the AppImage;
  the installer performs no downloads.
- **Explicit consent**: no privileged command runs before the plan is shown and
  confirmed; each escalation goes through the system authentication dialog.
- **Fail closed**: any step failure aborts the remainder, prints what failed
  and the exact manual command, and leaves the system in a valid state
  (dkms registrations from a failed run are rolled back).
- **Shell hygiene**: `set -euo pipefail`, all variables quoted, no `eval`, no
  temp files in predictable world-writable paths (use `mktemp`).

## Error handling

Every step failure prints the failing command, its output, a manual retry
command, and a troubleshooting doc link. `--yes` mode exits non-zero with a
machine-readable failure code for the GUI.

## Testing

- Bats-style unit tests for pure detection functions using os-release/uname
  fixtures for all eight platforms; runs in CI.
- `DRY_RUN=1` mode asserting the exact planned command list per fixture, so
  every distro path is testable without root.
- Real end-to-end validation on Fedora + CachyOS COPR kernel (primary dev
  box); Bazzite VM when available.
