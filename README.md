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

## License

The combined work is **AGPL-3.0-only** (required by the DS5_Bridge-derived
code). Files under `vds/` retain their upstream MIT license. See
`ds5-bridge/LICENSE`, `ds5-bridge/NOTICE`, and `vds/LICENSE`.
