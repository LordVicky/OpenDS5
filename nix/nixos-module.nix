# NixOS module for OpenDS5: kernel module + userspace daemon + udev rules
# + wireplumber config. The declarative equivalent of everything
# installer/opends5-install does on other distributions.
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.opends5;
in
{
  options.services.opends5 = {
    enable = lib.mkEnableOption "OpenDS5 virtual DualSense stack";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.vds;
      defaultText = lib.literalExpression "opends5.packages.<system>.vds";
      description = "The vds userspace package (vdsd, vdsctl, rules).";
    };

    users = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      example = [ "alice" ];
      description = "Users added to the vds group (access to /dev/vds*).";
    };
  };

  config = lib.mkIf cfg.enable {
    boot.extraModulePackages = [
      (pkgs.callPackage ./vds-module.nix {
        kernel = config.boot.kernelPackages.kernel;
        version = self.opends5Version;
      })
    ];
    boot.kernelModules = [ "vds_hcd" ];

    users.groups.vds = { };
    users.users = lib.genAttrs cfg.users (_: {
      extraGroups = [ "vds" ];
    });

    services.udev.packages = [ cfg.package ];

    environment.systemPackages = [ cfg.package ];

    # Session-manager config for the controller's audio path; the system-wide
    # conf.d is merged by wireplumber alongside any per-user config.
    environment.etc."wireplumber/wireplumber.conf.d/99-vds-dualsense.conf".source =
      "${cfg.package}/share/wireplumber/wireplumber.conf.d/99-vds-dualsense.conf";

    systemd.services.vdsd = {
      description = "vDS userspace daemon (OpenDS5)";
      after = [ "bluetooth.service" ];
      wants = [ "bluetooth.service" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "simple";
        ExecStart = "${cfg.package}/bin/vdsd";
        Restart = "on-failure";
        RestartSec = "1s";
      };
    };
  };
}
