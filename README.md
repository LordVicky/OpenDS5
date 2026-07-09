# Virtual DS5 Bridge

Bring the **DS5 Bridge** feature set (audio, haptics, Trigger Lab, lighting,
button remapping, personas, chords) to **Linux** — with no Pico 2 W hardware —
by using **vds** (virtual DualSense) as the transport layer instead of the
Pico dongle.

## How the pieces fit

```
DualSense (Bluetooth)
   │
   ▼
vds_hcd.ko (kernel module) + vdsd (daemon)     ← from hurryman2212/vds
   │  exposes the controller as a virtual USB DualSense
   ▼
Companion app (Electron, ported to Linux)      ← from SundayMoments/DS5_Bridge
      talks to vdsd instead of the Pico's WinUSB companion interface
```

## Repo layout

| Path | Origin | License | Purpose |
| --- | --- | --- | --- |
| `vds/` | [hurryman2212/vds](https://github.com/hurryman2212/vds) @ `1448bb8` | MIT | Kernel module, `vdsd` daemon, `vdsctl` — the Linux transport. |
| `ds5-bridge/companion/` | [SundayMoments/DS5_Bridge](https://github.com/SundayMoments/DS5_Bridge) @ `a8ec87d` | AGPL-3.0-only | Electron companion app to be ported to Linux. |
| `ds5-bridge/docs/` | DS5_Bridge | AGPL-3.0-only | Upstream development docs. |
| `docs/PORTING.md` | this repo | — | Port plan and Windows-dependency inventory. |

The Pico 2 W firmware, board files, and Windows installer tooling from
DS5_Bridge were intentionally **not** imported — the vds transport replaces
that hardware path.

## Trigger Profiles

Adaptive trigger profiles let the companion app automatically apply
per-game DualSense trigger effects (weapon/vibration modes, start/wall/force
percentages) for games that have no native DualSense support — the app
detects the running process, matches it to a saved profile, and pushes the
effect to the controller through the same bridge transport used for the rest
of DS5 Bridge's features.

- **Where profiles live:** `<userData>/trigger-profiles/*.json` (one file
  per profile; see `TriggerProfileStore` in
  `ds5-bridge/companion/src/main/trigger-profile-store.ts`).
- **evdev permission note:** reactive modifiers (e.g. "full pull" vibration)
  read live trigger input from the virtual DualSense's `/dev/input/event*`
  node, which requires read access to that device — typically membership in
  the `input` group. Without that access, static base effects (the profile's
  default weapon/vibration curve) still apply; reactive modifiers do not.
- **Planned:** audio-reactive trigger modifiers are a planned M2 addition —
  not implemented yet.

## License

The combined work is **AGPL-3.0-only** (required by the DS5_Bridge-derived
code). Files under `vds/` retain their upstream MIT license. See
`ds5-bridge/LICENSE`, `ds5-bridge/NOTICE`, and `vds/LICENSE`.
