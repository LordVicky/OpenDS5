#!/bin/sh
# One-time system install for the Virtual DS5 Bridge stack:
# kernel module (DKMS + autoload), vdsd/vdsctl + systemd service,
# vds group for socket access, and udev rules.
#
# Usage: sudo ./install-system.sh [username-to-grant-access]
set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi

repo="$(dirname "$(realpath "$0")")"
grant_user="${1:-${SUDO_USER:-}}"

echo "==> stopping dev test units"
systemctl stop vdsd-test vdsd-test2 vdsd-test3 2>/dev/null || true
systemctl reset-failed vdsd-test vdsd-test2 vdsd-test3 2>/dev/null || true

echo "==> kernel module (DKMS) + autoload"
make -C "$repo/vds/module" install
echo vds_hcd > /etc/modules-load.d/vds.conf
modprobe vds_hcd

echo "==> userspace + systemd service"
cmake -S "$repo/vds" -B "$repo/vds/build" -DINSTALL_SERVICE=YES >/dev/null
make -C "$repo/vds/build" -j"$(nproc)" >/dev/null
make -C "$repo/vds/build" install >/dev/null

echo "==> vds group for control socket access"
groupadd -f vds
if [ -n "$grant_user" ]; then
  usermod -aG vds "$grant_user"
  echo "    added $grant_user to group vds (re-login required once)"
fi

echo "==> udev rules"
cp "$repo/vds/99-vds-dualsense-udev.rules" /etc/udev/rules.d/
udevadm control --reload-rules
udevadm trigger --subsystem-match=input || true

echo "==> starting vdsd.service"
systemctl daemon-reload
systemctl enable --now vdsd.service

echo
echo "Done. Remaining user-level steps (no sudo):"
echo "  cp $repo/vds/99-vds-dualsense-wireplumber.conf ~/.config/wireplumber/wireplumber.conf.d/"
echo "  systemctl --user restart pipewire pipewire-pulse wireplumber"
echo "  (and log out/in once so the vds group membership applies)"
