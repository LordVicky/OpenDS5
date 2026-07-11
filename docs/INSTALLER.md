# OpenDS5 System Installer

`installer/opends5-install` prepares a Linux host for the `vds_hcd` kernel
module. Run it via the AppImage:

```
./OpenDS5.AppImage --install-system
```

or standalone from a checkout: `bash installer/opends5-install`. It shows a
numbered plan of exactly what it will do on your system and asks once before
proceeding. Flags: `--yes` (no prompt), `--dry-run` (print the plan and the
exact commands, change nothing).

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
`/etc/modules-load.d/vds.conf`.

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
stubbed root helper, NixOS generation). No root required.
