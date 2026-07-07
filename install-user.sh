#!/bin/sh
# Usermode install: vdsd runs as YOUR user with the uhid backend — no
# kernel module. Game HD haptics and direct speaker routing degrade to
# rumble emulation + the vdsd audio side channel (companion audio
# features keep working).
#
# One sudo pass grants the needed device/network permissions, then the
# daemon itself runs entirely in your session.
set -e
repo="$(dirname "$(realpath "$0")")"
user="${SUDO_USER:-$USER}"

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo (grants file capabilities + udev rules once)" >&2
  exit 1
fi

echo "==> building and installing binaries"
cmake -S "$repo/vds" -B "$repo/vds/build" >/dev/null
make -C "$repo/vds/build" -j"$(nproc)" >/dev/null
install -m755 "$repo/vds/build/vdsd" "$repo/vds/build/vdsctl" /usr/local/bin/
install -m755 -o root "$repo/vds-backend-switch" /usr/local/bin/vds-backend-switch

echo "==> capabilities: L2CAP HID ports + HCI RSSI without root"
setcap 'cap_net_bind_service,cap_net_raw+eip' /usr/local/bin/vdsd

echo "==> vds group + udev rules (uhid, touchpad)"
groupadd -f vds
usermod -aG vds "$user"
cat > /etc/udev/rules.d/99-vds-access.rules <<'RULES'
KERNEL=="uhid", SUBSYSTEM=="misc", OPTIONS+="static_node=uhid", GROUP="vds", MODE="0660"
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="*DualSense*Touchpad*", GROUP="vds", MODE="0660"
RULES
cp "$repo/vds/99-vds-dualsense-udev.rules" /etc/udev/rules.d/
udevadm control --reload-rules
udevadm trigger || true
# static nodes are only re-permissioned at udevd startup; apply now too
if [ -e /dev/uhid ]; then chgrp vds /dev/uhid && chmod 660 /dev/uhid; fi

echo "==> user service"
user_home="$(getent passwd "$user" | cut -d: -f6)"
install -d -o "$user" -g "$user" "$user_home/.config/systemd/user" \
  "$user_home/.local/share/vds" "$user_home/.local/state"
cat > "$user_home/.config/systemd/user/vdsd.service" <<UNIT
[Unit]
Description=vDS userspace daemon (uhid backend)
After=bluetooth.service

[Service]
Type=simple
ExecStart=/usr/local/bin/vdsd --backend uhid --socket %t/vdsd.sock --db-path %h/.local/share/vds/vdsd.db --log %h/.local/state/vdsd.log
Restart=on-failure
RestartSec=1s

[Install]
WantedBy=default.target
UNIT
chown "$user:$user" "$user_home/.config/systemd/user/vdsd.service"

echo
echo "Done. As $user (after logging out/in once for the vds group):"
echo "  systemctl --user enable --now vdsd.service"
echo "Disable the system daemon first if it is running:"
echo "  sudo systemctl disable --now vdsd.service"
