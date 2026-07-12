#!/usr/bin/env bash
set -u
. "$(dirname "$0")/harness.sh"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"

# fake AppImage file + bundled icon
appimg="$tmp/Downloads/OpenDS5-Setup.AppImage"
mkdir -p "$tmp/Downloads"
: > "$appimg"
chmod +x "$appimg"
appdir="$tmp/.mount_fake"
mkdir -p "$appdir/resources/assets/controllers" "$appdir/resources/vds-module"
: > "$appdir/resources/assets/controllers/opends5_app-icon.png"
printf 'PACKAGE_VERSION="1.6.3"\n' > "$appdir/resources/vds-module/dkms.conf"

plan() { # extra env...
  env "$@" OPENDS5_OS_RELEASE="$here/fixtures/fedora/os-release" \
      OPENDS5_UNAME_R=6.15.4-200.fc44.x86_64 OPENDS5_SYSROOT=/nonexistent \
      OPENDS5_SB_STATE=disabled OPENDS5_USERSPACE_DIR=/nonexistent \
      OPENDS5_DRY_RUN=1 HOME="$tmp" bash "$here/../opends5-install" --yes
}

# not running from an AppImage: no launcher steps
out="$(plan APPDIR=)"
case "$out" in *.desktop*) f=1 ;; *) f=0 ;; esac
assert_eq 0 "$f" "no launcher steps outside an AppImage"

# running from an AppImage: install it and create the launcher
out="$(plan APPDIR="$appdir" APPIMAGE="$appimg")"
assert_contains "$out" "$tmp/Applications/OpenDS5.AppImage" "AppImage copied to ~/Applications"
assert_contains "$out" "$tmp/.local/share/applications/opends5.desktop" "desktop entry written"
assert_contains "$out" "Exec=$tmp/Applications/OpenDS5.AppImage" "Exec points at the installed copy"
assert_contains "$out" "$tmp/.local/share/icons" "icon installed"
assert_contains "$out" "chown" "launcher files owned by the user"
rm -rf "$tmp"
finish
