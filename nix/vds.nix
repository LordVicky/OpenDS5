# Userspace stack: the vdsd daemon and vdsctl CLI, built from the in-tree
# vds/ source. Also installs the udev rules and wireplumber config so the
# NixOS module can reference them from one package.
{ lib
, stdenv
, cmake
, pkg-config
, bluez
, dbus
, libopus
, udev
, version
}:

stdenv.mkDerivation {
  pname = "vds";
  inherit version;

  src = ../vds;

  nativeBuildInputs = [ cmake pkg-config ];
  buildInputs = [ bluez dbus libopus udev ];

  # generate-version.sh needs the git repo (absent in the sandbox); the build
  # falls back to "unknown" without this.
  postPatch = ''
    cat > generate-version.sh <<EOF
    #!/bin/sh
    echo ${version}
    EOF
    chmod +x generate-version.sh
  '';

  # Upstream install() also runs service-registration hooks; install the
  # binaries and support files directly instead.
  installPhase = ''
    runHook preInstall
    install -Dm755 vdsd $out/bin/vdsd
    install -Dm755 vdsctl $out/bin/vdsctl
    install -Dm644 ../99-vds-dualsense-udev.rules \
      $out/lib/udev/rules.d/99-vds-dualsense.rules
    install -Dm644 ../99-vds-dualsense-wireplumber.conf \
      $out/share/wireplumber/wireplumber.conf.d/99-vds-dualsense.conf
    runHook postInstall
  '';

  meta = with lib; {
    description = "vDS virtual DualSense userspace daemon (OpenDS5)";
    homepage = "https://github.com/LordVicky/OpenDS5";
    license = licenses.mit;
    platforms = platforms.linux;
    mainProgram = "vdsd";
  };
}
