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
install -m755 -o root "$repo/vds-backend-switch" /usr/local/bin/vds-backend-switch

echo "==> vds group for control socket access"
groupadd -f vds
id -u vds >/dev/null 2>&1 || useradd -r -g vds -s /usr/sbin/nologin vds
if [ -n "$grant_user" ]; then
  usermod -aG vds "$grant_user"
  echo "    added $grant_user to group vds (re-login required once)"
fi

echo "==> udev rules"
cp "$repo/vds/99-vds-dualsense-udev.rules" /etc/udev/rules.d/
cat > /etc/udev/rules.d/99-vds-access.rules <<'RULES'
# vds group access to the virtual controller ports, uhid, and the
# DualSense touchpad node (for pointer suppression).
KERNEL=="vds[0-9]*", GROUP="vds", MODE="0660"
KERNEL=="uhid", SUBSYSTEM=="misc", OPTIONS+="static_node=uhid", GROUP="vds", MODE="0660"
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="*DualSense*Touchpad*", GROUP="vds", MODE="0660"
RULES
udevadm control --reload-rules
udevadm trigger || true
# static nodes are only re-permissioned at udevd startup; apply now too
if [ -e /dev/uhid ]; then chgrp vds /dev/uhid && chmod 660 /dev/uhid; fi

echo "==> hardening: vdsd runs as the unprivileged vds user"
install -d -o root -g vds -m 2775 /var/lib/vds
touch /var/log/vdsd.log && chown root:vds /var/log/vdsd.log && chmod 664 /var/log/vdsd.log
install -d /etc/systemd/system/vdsd.service.d
cat > /etc/systemd/system/vdsd.service.d/hardening.conf <<'UNIT'
[Service]
User=vds
Group=vds
AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_NET_RAW
RuntimeDirectory=vds
ExecStart=
ExecStart=/usr/local/bin/vdsd --socket /run/vds/vdsd.sock
NoNewPrivileges=yes
ProtectSystem=full
ProtectHome=yes
UNIT

echo "==> starting vdsd.service"
systemctl daemon-reload
systemctl enable --now vdsd.service

echo
echo "Done. Remaining user-level steps (no sudo):"
echo "  cp $repo/vds/99-vds-dualsense-wireplumber.conf ~/.config/wireplumber/wireplumber.conf.d/"
echo "  systemctl --user restart pipewire pipewire-pulse wireplumber"
echo "  (and log out/in once so the vds group membership applies)"
