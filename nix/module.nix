{
  self,
  version,
}: {
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.opends5;

  vds = self.packages.${pkgs.stdenv.hostPlatform.system}.vds;

  opends5 =
    self.packages.${pkgs.stdenv.hostPlatform.system}.opends5;

  vdsHcd = config.boot.kernelPackages.callPackage ./vds-hcd.nix {
    inherit version;
  };
in {
  options.services.opends5 = {
    enable =
      lib.mkEnableOption "OpenDS5 DualSense bridge and companion application";

    maxPorts = lib.mkOption {
      type = lib.types.ints.between 1 4;
      default = 4;
      description = "Number of virtual DualSense ports to create.";
    };

    disableBluezInputPlugin = lib.mkOption {
      type = lib.types.bool;
      default = false;

      description = ''
        Disable BlueZ's input plugin so vdsd can directly own the
        DualSense Bluetooth HID Control and Interrupt L2CAP channels.

        This may prevent Bluetooth keyboards, mice, and other Bluetooth
        HID devices from functioning through BlueZ.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    warnings = lib.optional cfg.disableBluezInputPlugin ''
      OpenDS5 is disabling BlueZ's input plugin. Bluetooth keyboards,
      mice, and other Bluetooth HID devices may stop working.
    '';

    boot.extraModulePackages = [
      vdsHcd
    ];

    boot.kernelModules = [
      "vds_hcd"
    ];

    boot.extraModprobeConfig = ''
      options vds_hcd max_port=${toString cfg.maxPorts}
    '';

    environment.systemPackages = [
      opends5
      vds
    ];

    services.udev.packages = [
      vds
    ];

    environment.etc."wireplumber/wireplumber.conf.d/99-vds-dualsense.conf".source = "${vds}/share/wireplumber/wireplumber.conf.d/99-vds-dualsense.conf";

    hardware.bluetooth.disabledPlugins = lib.mkIf cfg.disableBluezInputPlugin [
      "input"
    ];

    systemd.services.vdsd = {
      description = "Virtual DualSense userspace daemon";

      wantedBy = [
        "multi-user.target"
      ];

      wants = [
        "bluetooth.service"
      ];

      after = [
        "bluetooth.service"
        "systemd-modules-load.service"
      ];

      serviceConfig = {
        Type = "simple";

        ExecStart = "${vds}/bin/vdsd";

        # vdsd creates its control socket asynchronously after startup.
        # Wait for it before assigning access to the input group.
        ExecStartPost = [
          "${pkgs.writeShellScript "vdsd-configure-socket" ''
            for i in $(${pkgs.coreutils}/bin/seq 1 50); do
              if [ -S /run/vdsd.sock ]; then
                ${pkgs.coreutils}/bin/chgrp input /run/vdsd.sock
                ${pkgs.coreutils}/bin/chmod 0660 /run/vdsd.sock
                exit 0
              fi

              ${pkgs.coreutils}/bin/sleep 0.1
            done

            echo "vdsd socket was not created within 5 seconds" >&2
            exit 1
          ''}"
        ];

        Restart = "on-failure";
        RestartSec = 1;
      };
    };
  };
}
