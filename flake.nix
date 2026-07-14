{
  description = "OpenDS5 — virtual DualSense stack (vds_hcd kernel module + vdsd userspace)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      version =
        (builtins.fromJSON
          (builtins.readFile ./ds5-bridge/companion/package.json)).version;
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems
        (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # Single source of truth for the module/package version (the app
      # version; matches what DKMS stamps on other distros).
      opends5Version = version;

      packages = forAllSystems (pkgs: rec {
        vds = pkgs.callPackage ./nix/vds.nix { inherit version; };
        # Standalone module build against the default nixpkgs kernel, mainly
        # for `nix build .#vds-module` smoke tests. The NixOS module builds
        # against the host's configured kernel instead.
        vds-module = pkgs.callPackage ./nix/vds-module.nix {
          kernel = pkgs.linuxPackages.kernel;
          inherit version;
        };
        default = vds;
      });

      nixosModules = rec {
        opends5 = import ./nix/nixos-module.nix self;
        default = opends5;
      };

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          inputsFrom = [ self.packages.${pkgs.stdenv.hostPlatform.system}.vds ];
        };
      });
    };
}
