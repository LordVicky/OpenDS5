{
  description = "OpenDS5 — DualSense companion application and virtual DualSense stack";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    version =
      (builtins.fromJSON (
        builtins.readFile ./ds5-bridge/companion/package.json
      )).version;

    systems = [
      "x86_64-linux"
      "aarch64-linux"
    ];

    forAllSystems = f:
      nixpkgs.lib.genAttrs systems (
        system:
          f nixpkgs.legacyPackages.${system}
      );
  in {
    packages = forAllSystems (
      pkgs: rec {
        vds = pkgs.callPackage ./nix/vds.nix {
          inherit version;
        };

        opends5 = pkgs.callPackage ./nix/opends5.nix {
          inherit version;
        };

        vds-module = pkgs.callPackage ./nix/vds-module.nix {
          kernel = pkgs.linuxPackages.kernel;
          inherit version;
        };

        default = opends5;
      }
    );

    nixosModules = rec {
      opends5 = import ./nix/nixos-module.nix {
        inherit self version;
      };

      default = opends5;
    };

    devShells = forAllSystems (
      pkgs: {
        default = pkgs.mkShell {
          inputsFrom = [
            self.packages.${pkgs.stdenv.hostPlatform.system}.vds
            self.packages.${pkgs.stdenv.hostPlatform.system}.opends5
          ];
        };
      }
    );
  };
}
