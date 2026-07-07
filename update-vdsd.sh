#!/bin/sh
# Rebuild-and-redeploy for the daemon after source changes:
# installs vdsd/vdsctl over the system copies and restarts the service.
set -e
repo="$(dirname "$(realpath "$0")")"
make -C "$repo/vds/build" -j"$(nproc)"
install -m755 "$repo/vds/build/vdsd" "$repo/vds/build/vdsctl" /usr/local/bin/
systemctl restart vdsd.service
echo "vdsd updated and restarted."
