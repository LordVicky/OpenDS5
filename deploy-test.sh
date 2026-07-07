#!/bin/sh
# Dev helper: install freshly built vdsd/vdsctl and (re)start a transient
# test daemon with a user-accessible control socket.
set -e
repo="$(dirname "$(realpath "$0")")"
systemctl stop vdsd-test vdsd-test2 vdsd-test3 2>/dev/null || true
systemctl reset-failed vdsd-test vdsd-test2 vdsd-test3 2>/dev/null || true
install -m755 "$repo/vds/build/vdsd" /usr/local/bin/vdsd
install -m755 "$repo/vds/build/vdsctl" /usr/local/bin/vdsctl
systemd-run --unit=vdsd-test3 /usr/local/bin/vdsd
sleep 1
chmod 666 /run/vdsd.sock
echo "vdsd deployed and running; socket ready."
