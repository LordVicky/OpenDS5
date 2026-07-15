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
| NixOS | Nothing to run: use the flake (see "NixOS" below). The installer's fallback writes `./opends5-vds.nix` + `./opends5-vds-src/` for non-flake configs |
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
5. disables BlueZ's input plugin (`bluetoothd --noplugin=input`, applied via
   the bundled `override-bluetoothd.sh`, skipped if already in effect) — vds
   needs raw ownership of the controller's Bluetooth HID channels, and with
   the plugin active BlueZ claims the DualSense first and the app never sees
   it. **Trade-off (upstream vds limitation): other Bluetooth input devices
   such as keyboards and mice will not work while this is active.** Revert
   anytime with `sudo /usr/share/opends5/override-bluetoothd.sh enable-input
   --restart`,
6. reloads systemd and enables/starts `vdsd.service`.

Without a bundle (e.g. a plain repo checkout) these steps are skipped and
`install-system.sh` builds vdsd from source instead.

## Application launcher

When run from an AppImage, the installer also installs the app itself so users
never have to place the file or hand-write a `.desktop` entry:

- copies the running AppImage to `~/Applications/OpenDS5.AppImage` (skipped if
  it is already there — re-running is idempotent),
- installs the icon to `~/.local/share/icons/hicolor/256x256/apps/opends5.png`,
- writes `~/.local/share/applications/opends5.desktop` with `Exec=` pointing at
  the installed copy, then refreshes the desktop database.

All three are owned by the invoking user, not root. Outside an AppImage (repo
checkout) the step is skipped.

The binaries are built in CI on Ubuntu 22.04 (glibc 2.35 baseline), so one
build runs on every 2022-or-newer distribution.

## NixOS

NixOS is configured declaratively, so the installer never escalates and never
modifies the system there. The repo ships a **flake** that replaces the whole
installer — kernel module *and* userspace — with one import.

### Flake (recommended)

Add the input and enable the service in your flake-based configuration:

```nix
{
  inputs.opends5.url = "github:LordVicky/OpenDS5";

  # in your nixosConfigurations.<host>:
  modules = [
    inputs.opends5.nixosModules.default
    {
      services.opends5 = {
        enable = true;
        maxPorts = 4;
      };

      users.users.YOURNAME.extraGroups = [ "input" ];
    }
  ];
}
```

Then `sudo nixos-rebuild switch`. This is the declarative equivalent of
everything the installer does on other distributions:

- builds the `vds_hcd` kernel module from source against *your* configured
  kernel (`boot.extraModulePackages`) and autoloads it — no DKMS, no MOK
  signing; kernel bumps rebuild it automatically,
- builds `vdsd`/`vdsctl` from the `vds/` source tree (no glibc-prebuilt
  binaries, no nix-ld),
- installs the udev rules, the system-wide wireplumber config, and the
  `vdsd` systemd unit,
- enables Bluetooth and runs bluetoothd with `--noplugin=input` so vds can
  own the controller's HID channels — without this, BlueZ claims the
  DualSense first and the app never sees it. While active, other Bluetooth
  input devices (keyboards, mice) will not work; opt out with
  `services.opends5.disableBluetoothInputPlugin = false;` and use USB.

The companion application is installed into the system profile. Launch it
with `opends5` or from your desktop application menu.

**Updates**: OpenDS5 only notifies NixOS users when a newer release is
available. Update the flake input and rebuild declaratively:
`nix flake update opends5 && sudo nixos-rebuild switch`.

Smoke-test the packages without a NixOS machine (any box with Nix):
`nix build .#vds` and `nix build .#vds-module`.

### Generator fallback (non-flake configs)

`--install-system` on NixOS runs entirely unprivileged and writes two things
to the current directory: `opends5-vds.nix` (a module that builds `vds_hcd`
via `boot.extraModulePackages`) and `opends5-vds-src/` (the module source).
Move both next to `configuration.nix`, add
`imports = [ ./opends5-vds.nix ];`, and `sudo nixos-rebuild switch`.

The fallback covers the kernel module only. For userspace, mirror the flake
module by hand: create the `vds` group, add your user, install the udev rules
(`vds-bin/99-vds-dualsense-udev.rules`) via `services.udev.extraRules`, and
run `vdsd` as a systemd service built from the `vds/` source (the prebuilt
Ubuntu binaries need `programs.nix-ld.enable`). Re-run the generator and
rebuild after driver updates.

Verify either path with `lsmod | grep vds_hcd` and `ls /dev/vds*` after the
rebuild (reboot if the kernel changed).

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
