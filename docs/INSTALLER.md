# OpenDS5 System Installer

`installer/opends5-install` prepares a Linux host for OpenDS5: the `vds_hcd`
kernel module and the `vdsd` userspace stack.

**Most users never run it directly** — the app opens a setup wizard on first
launch (see "Setup wizard" below). The CLI equivalents:

```
./OpenDS5.AppImage --install-system     # from the AppImage
bash installer/opends5-install           # from a checkout
```

It shows a numbered plan of exactly what it will do on your system and asks
once before proceeding. Flags: `--yes` (no prompt), `--dry-run` (print the plan
and exact commands, change nothing), `--json-progress` (machine-readable event
stream; used by the wizard).

## What it does per platform

| Platform | Mechanism |
|---|---|
| Fedora | dnf: dkms + `kernel-devel` (or `kernel-cachyos-devel` on CachyOS COPR kernels) |
| Arch / CachyOS | pacman: dkms + flavor-matched headers (`linux-cachyos-headers`, `linux-zen-headers`, …); Clang/LTO kernels build with `LLVM=1` |
| Debian / Ubuntu | apt: dkms + `linux-headers-$(uname -r)` |
| openSUSE | zypper: dkms + `kernel-default-devel` |
| Bazzite / Silverblue | `rpm-ostree install --idempotent dkms kernel-devel`; requires one reboot, then re-run the installer |
| NixOS | No system changes: writes `./opends5-vds.nix` + `./opends5-vds-src/` for `boot.extraModulePackages`; apply with `nixos-rebuild switch` |
| Anything else | Clean "unsupported" message; see docs/PORTING.md for manual steps |

On all dkms-based platforms it then stages the module source to
`/usr/src/vds_hcd-<version>/`, registers and builds it with DKMS (so future
kernel updates rebuild automatically), and enables autoload via
`/etc/modules-load.d/vds.conf`. When the module is already loaded, the kernel
steps are skipped so re-runs are fast and idempotent.

## Userspace phase

When prebuilt binaries are bundled (they ship inside the AppImage; build them
locally with `scripts/collect-vds-bin.sh`), the installer also:

1. installs `vdsd` and `vdsctl` to `/usr/local/bin`,
2. installs `vdsd.service` to `/etc/systemd/system/` and the udev rules to
   `/etc/udev/rules.d/`, then reloads udev,
3. creates the `vds` group and adds the invoking user,
4. installs the wireplumber config into the user's
   `~/.config/wireplumber/wireplumber.conf.d/` (owned by the user, not root),
5. reloads systemd and enables/starts `vdsd.service`.

Without a bundle (e.g. a plain repo checkout) these steps are skipped and
`install-system.sh` builds vdsd from source instead.

The binaries are built in CI on Ubuntu 22.04 (glibc 2.35 baseline), so one
build runs on every 2022-or-newer distribution.

## Setup wizard

On Linux, the app checks at launch whether `vds_hcd` is loaded and
`vdsd.service` is active. If not — and setup wasn't skipped before — it opens a
setup window before the main window:

1. **Welcome** — what will be installed and why a password is needed.
2. **Review** — the exact plan for *this* distribution.
3. **Progress** — one polkit password prompt, then live per-step progress. On
   failure: the log path, Retry, Open log, and Copy diagnostics.
4. **Done** — success (or "reboot to finish MOK enrollment").

"Skip for now" is remembered in settings. NixOS shows copyable instructions
instead of an install button, since it is configured declaratively.

## Progress protocol (`--json-progress`)

One JSON object per line on stdout:

| Event | Fields |
|---|---|
| `plan` | `total`, `steps[]`, `log` (path to the root log) |
| `step` | `index` (0-based), `status`: `start` \| `ok` \| `fail`, `exit` on failure |
| `done` | `exit` (the installer's exit code) |

Human-readable output is suppressed while the flag is on.

## Logs

| Path | Contents |
|---|---|
| `/var/log/opends5/install.log` | Privileged run: header (version, distro, kernel, Secure Boot/lockdown), every command, its complete stdout+stderr, and exit codes |
| `~/.local/state/opends5/install.log` | Unprivileged side: run header and the plan |

Both are append-only across runs. Nothing secret is ever written to them.
The wizard's failure screen surfaces the log path and can copy a diagnostics
bundle (log tail + detection snapshot) for bug reports.

## Secure Boot

If Secure Boot is enabled, modules must be signed with a MOK-enrolled key —
Fedora-lineage kernels enforce this even when lockdown reports `none`. The
installer uses DKMS's own default signing key (`/var/lib/dkms/mok.key`,
root-only; generated if missing) so systems that already did the MOK dance for
any DKMS module need nothing extra. If the key isn't enrolled yet, it runs
`mokutil --import` (you choose a one-time password, then confirm in the blue
MOK Manager screen on next reboot); in that case the module is built and
installed but only loads after the reboot (exit code 6).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (or dry run) |
| 2 | Usage error |
| 3 | Unsupported distribution |
| 4 | A step failed; partial DKMS registration rolled back |
| 5 | Module built and loaded but `/dev/vds*` missing |
| 6 | Module built and signed; reboot needed to complete MOK enrollment before it loads |

## Security guarantees

- Additive only: installs packages and adds files; never removes or edits
  existing host configuration, bootloader entries, or other modules.
- Single authentication: after you confirm the plan, all privileged steps run
  in one `pkexec`/`sudo` invocation (one password prompt). Your password is
  never read or stored by the installer. Detection and planning run
  unprivileged; the NixOS flow never escalates at all.
- No network access: everything executed ships inside the AppImage/repo.
- Fail closed: the first failing step aborts the run, prints the exact manual
  retry command, and rolls back the DKMS registration.

## Testing

`bash installer/tests/run-tests.sh` runs the fixture-based suite (platform
detection, per-distro plan output, Secure Boot logic, execution/rollback via a
stubbed root helper, userspace phase, JSON progress framing, logging, NixOS
generation). No root required.

Wizard and setup-service tests live in the companion suite:
`cd ds5-bridge/companion && npx vitest run src`.
