# vds_hcd kernel module, built out-of-tree against the given kernel.
# Instantiated by the NixOS module with config.boot.kernelPackages.kernel,
# so it always matches the configured kernel and rebuilds on kernel bumps.
{ lib
, stdenv
, kernel
, version
}:

stdenv.mkDerivation {
  pname = "vds_hcd";
  inherit version;

  # Kbuild references ../include, so the source root is the whole vds tree.
  src = ../vds;

  hardeningDisable = [ "pic" ];
  nativeBuildInputs = kernel.moduleBuildDependencies;

  makeFlags = [
    "-C" "module"
    "KERNELRELEASE=${kernel.modDirVersion}"
    "KDIR=${kernel.dev}/lib/modules/${kernel.modDirVersion}/build"
    "VDS_VERSION=${version}"
  ];

  installPhase = ''
    runHook preInstall
    install -D module/vds_hcd.ko \
      $out/lib/modules/${kernel.modDirVersion}/extra/vds_hcd.ko
    runHook postInstall
  '';

  meta = with lib; {
    description = "vDS virtual USB host controller kernel module (OpenDS5)";
    homepage = "https://github.com/LordVicky/OpenDS5";
    license = licenses.mit;
    platforms = platforms.linux;
  };
}
