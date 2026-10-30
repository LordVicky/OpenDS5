# vds_hcd kernel module, built out-of-tree against the given kernel.
# Instantiated by the NixOS module with config.boot.kernelPackages.kernel,
# so it always matches the configured kernel and rebuilds on kernel bumps.
{ lib
, stdenv
, kernel
, version
}:

let
  kdir = "${kernel.dev}/lib/modules/${kernel.modDirVersion}/build";

  # The kernel's own make flags. Since nixpkgs started signing modules with
  # kmodigest, these carry the `cmd_sign` override that writes the
  # vds_hcd.ko.cer certificate NixOS needs when it assembles the module
  # tree; without it that build fails (NixOS/nixpkgs#575192). Older kernels
  # do not have the attribute and need nothing extra.
  kernelFlags = kernel.commonMakeFlags or [ ];
in
stdenv.mkDerivation {
  pname = "vds_hcd";
  inherit version;

  # Kbuild references ../include, so the source root is the whole vds tree.
  src = ../vds;

  hardeningDisable = [ "pic" ];
  nativeBuildInputs = kernel.moduleBuildDependencies;

  makeFlags = kernelFlags ++ [
    "-C" "module"
    "KERNELRELEASE=${kernel.modDirVersion}"
    "KDIR=${kdir}"
    "VDS_VERSION=${version}"
  ];

  # Install through Kbuild rather than copying the .ko, so the module goes
  # through the kernel's signing step. DEPMOD=true keeps it from writing a
  # module index into $out; NixOS builds one for the whole tree.
  installPhase = ''
    runHook preInstall
    make -C ${kdir} M="$PWD/module" \
      ${lib.escapeShellArgs kernelFlags} \
      KERNELRELEASE=${kernel.modDirVersion} \
      VDS_VERSION=${version} \
      INSTALL_MOD_PATH="$out" \
      INSTALL_MOD_DIR=extra \
      DEPMOD=true \
      modules_install
    runHook postInstall
  '';

  meta = with lib; {
    description = "vDS virtual USB host controller kernel module (OpenDS5)";
    homepage = "https://github.com/LordVicky/OpenDS5";
    license = licenses.mit;
    platforms = platforms.linux;
  };
}
