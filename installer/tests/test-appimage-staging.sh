#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"

# Simulate an AppImage mount: sources live under $APPDIR/resources/, which on a
# real FUSE mount root cannot read.
appdir="$tmp/.mount_fake"
mkdir -p "$appdir/resources/vds-bin" "$appdir/resources/vds-module" \
         "$appdir/resources/assets/controllers"
for f in vdsd vdsctl; do : > "$appdir/resources/vds-bin/$f"; done
printf 'ExecStart=@VDS_SYSTEMD_VDSD@\n' > "$appdir/resources/vds-bin/vdsd.service.in"
: > "$appdir/resources/vds-bin/99-vds-dualsense-udev.rules"
: > "$appdir/resources/vds-bin/99-vds-dualsense-wireplumber.conf"
printf 'PACKAGE_VERSION="1.6.3"\n' > "$appdir/resources/vds-module/dkms.conf"
# the launcher icon lives in the mount too — it must be staged like everything else
: > "$appdir/resources/assets/controllers/ds5-bridge_app-icon-tile.png"
appimg="$tmp/Downloads/OpenDS5.AppImage"
mkdir -p "$tmp/Downloads"
: > "$appimg"
chmod +x "$appimg"

# rootstub logs the generated runner instead of executing it
cat > "$tmp/rootstub" <<'EOF'
#!/usr/bin/env bash
[ "$1" = bash ] && [ -f "${2:-}" ] && cat "$2" >> "$ROOTLOG"
exit 0
EOF
chmod +x "$tmp/rootstub"

: > "$tmp/log"
env ROOTLOG="$tmp/log" OPENDS5_ROOT_CMD="$tmp/rootstub" OPENDS5_LOG_DIR="$tmp/logs" \
    APPDIR="$appdir" APPIMAGE="$appimg" HOME="$tmp" \
    OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
    OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT=/nonexistent \
    OPENDS5_SB_STATE=disabled OPENDS5_SKIP_VERIFY=1 \
    bash "$here/../opends5-install" --yes >/dev/null 2>&1

runner="$(cat "$tmp/log")"
assert_contains "$runner" "install -m 0755" "userspace install step planned"
assert_contains "$runner" "opends5.desktop" "launcher step planned"
# The whole point: root must never be asked to read anything inside the mount —
# that includes the binaries, the module source AND the launcher icon.
case "$runner" in *"$appdir"*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "no AppImage-mount paths in root commands"
assert_contains "$runner" "opends5-stage" "sources staged to a root-readable dir"
assert_contains "$runner" "opends5-icon.png" "icon staged out of the mount"
rm -rf "$tmp"
finish
