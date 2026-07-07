# Porting plan: DS5 Bridge features on Linux via vds

Goal: run the DS5 Bridge companion experience on Linux with a
Bluetooth-connected DualSense, using vds (`vds_hcd.ko` + `vdsd`) as the
transport instead of the Pico 2 W dongle.

Upstream snapshots vendored here:

- `hurryman2212/vds` @ `1448bb8ef98c65b8962223889ea9441f921393a2`
- `SundayMoments/DS5_Bridge` @ `a8ec87d0fdb281d75e4bd5854d5b14d3aa05a3e4`

## Architecture decision

DS5 Bridge's companion app talks to the Pico over a **vendor HID / WinUSB
companion interface** (`companion/src/main/winusb-companion-transport.ts`,
protocol in `companion/src/shared/protocol.ts`). On Linux there is no Pico:
the controller is already exposed as a virtual USB DualSense by vds, and
`vdsd` owns the Bluetooth link.

The port therefore replaces the transport layer: implement a
**vdsd companion transport** in the Electron main process that speaks to
`vdsd` (extend vdsd with a local control socket / extend `vdsctl`'s IPC), and
map the companion protocol's commands (audio routing, haptics, trigger
effects, lightbar, remaps) onto DualSense output reports sent through vdsd.

## Windows-dependency inventory (companion app)

| File / area | Windows dependency | Linux replacement |
| --- | --- | --- |
| `main/winusb-companion-transport.ts` | WinUSB to Pico vendor interface | New `vdsd-companion-transport.ts` over a Unix domain socket to vdsd |
| `main/audio-helper.ts` + `native/AudioHelper/` | WASAPI audio sessions, endpoint mgmt, haptics mirroring | PipeWire (native module or `node-pipewire`); vds already ships a WirePlumber config |
| `main/pico-firmware-updater.ts`, `pico-universal-flash-nuke-hash.ts` | Pico BOOTSEL flashing | Drop (no hardware). Stub the firmware UI or hide behind a transport capability flag |
| `main/hid-discovery-client.ts` / `-worker.ts` | node-hid enumeration of Pico | Discover `/dev/vds*` nodes / query vdsd |
| `main/settings-store.ts`, tray/startup behavior | Windows paths, autostart | XDG paths, `.desktop` autostart entry |
| `shared/protocol.ts`, `shared/types.ts` | None (pure TS) | Reuse as-is |
| `renderer/` (React UI) | None significant | Reuse as-is; hide Pico-only panels via capability flags |

## vds-side work

- Add a companion control channel to `vdsd` (Unix socket, JSON commands —
  `vdsctl` already has a command surface to extend; see
  `vds/src/vdsctl_common.cc`).
- Expose the state the Overview page needs: connection health, battery,
  Bluetooth signal quality, active profile.
- vds explicitly does **not** support headset output / mic over Bluetooth
  (upstream README) — the Audio/mic pages must degrade gracefully; speaker
  and haptics-over-audio paths need investigation against
  `vds/include/vds/ds5_protocol.h`.

## Milestones

1. **M0 — build both upstreams**: `vds` kernel module + vdsd build and run on
   this machine (CachyOS: DKMS against the cachyos kernel); companion app
   `npm install && vite build` succeeds with Windows modules stubbed.
2. **M1 — transport swap**: vdsd companion socket + Electron transport;
   Overview page shows a live controller.
3. **M2 — output features**: lightbar, adaptive triggers (Trigger Lab),
   classic rumble via output reports.
4. **M3 — audio & haptics**: PipeWire capture → haptics; assess speaker
   support limits under Bluetooth.
5. **M4 — input features**: remapping, chords, personas (may need uinput or
   vds profile support — vds `--profile` already does ds5/dse persona
   switching).
6. **M5 — packaging**: AppImage/deb/Arch package, systemd + udev integration
   (vds ships `vdsd.service.in` and udev rules).

## Known risks

- Mic/headset audio is a hard limitation of Bluetooth HID transport per vds
  upstream — DS5 Bridge's mic feature likely cannot be ported 1:1.
- Personas beyond ds5/dse (DualShock 4, Xbox) would need new descriptor
  profiles in the vds kernel module.
- Kernel module API churn: vds targets mainline; verify against the running
  CachyOS kernel.
