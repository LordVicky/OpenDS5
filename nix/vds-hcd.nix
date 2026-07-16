{
  lib,
  stdenv,
  kernel,
  version,
}:
stdenv.mkDerivation {
  pname = "vds-hcd";
  inherit version;

  # Build from the entire vds source tree because the kernel module
  # references headers from ../include.
  src = ../vds;

  nativeBuildInputs = kernel.moduleBuildDependencies;

  hardeningDisable = [
    "fortify"
    "pic"
  ];

  buildPhase = ''
    runHook preBuild

    make \
      -C module \
      KERNELRELEASE=${kernel.modDirVersion} \
      KDIR=${kernel.dev}/lib/modules/${kernel.modDirVersion}/build \
      VDS_VERSION=${version}

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm644 \
      module/vds_hcd.ko \
      "$out/lib/modules/${kernel.modDirVersion}/extra/vds_hcd.ko"

    runHook postInstall
  '';

  meta = {
    description = "Virtual DualSense host controller kernel module";
    homepage = "https://github.com/LordVicky/OpenDS5";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux;
  };
}
