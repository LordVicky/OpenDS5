#!/bin/sh
# Reverts the usermode-backend system changes to the main-branch setup:
# root system daemon at /run/vdsd.sock, no backend switcher.
set -e
repo="$(dirname "$(realpath "$0")")"
systemctl stop vdsd.service 2>/dev/null || true
rm -rf /etc/systemd/system/vdsd.service.d
rm -f /usr/local/bin/vds-backend-switch
install -m755 "$repo/vds/build/vdsd" "$repo/vds/build/vdsctl" /usr/local/bin/
setcap -r /usr/local/bin/vdsd 2>/dev/null || true
rm -f /run/vds/vdsd.sock
systemctl daemon-reload
systemctl reset-failed vdsd.service 2>/dev/null || true
systemctl enable --now vdsd.service
sleep 1
chmod 660 /run/vdsd.sock && chgrp vds /run/vdsd.sock 2>/dev/null || true
echo "main-branch system setup restored; daemon: $(systemctl is-active vdsd.service)"
