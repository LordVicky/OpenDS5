# DualSense Edge support

This note describes the current Linux/OpenDS5 Edge support path. It records
what the repository implements and tests; it is not a claim that every
DualSense feature has been validated on physical hardware.

## Architecture

The normal data path is:

```text
physical DualSense Bluetooth HID
        │
        ▼
vds_hcd + vdsd  ── Bluetooth HID input is converted to the vds USB model
        │
        ▼
virtual wired DualSense exposed to Linux and the game
        │
        ├── game input/output through the virtual controller
        └── OpenDS5 companion input/remapping/shortcut path
```

Game output travels in the reverse direction for the Bluetooth bridge: the
game's virtual-USB output report is consumed by `vds_hcd`/`vdsd` and sent to
the physical controller. This is the path for game-driven rumble, adaptive
trigger state, lights, and other supported DualSense output. Companion-owned
overrides are merged into the vds output state before transmission. The
repository documents this topology, but physical output behavior remains a
manual hardware-validation item below.

## Model detection and supported IDs

The companion has one central classifier in `src/main/controller-device.ts`.
It uses Sony vendor ID `0x054c` and product ID to select the model:

| Model | Vendor ID | Product ID | Edge-only controls exposed by the classifier |
| --- | ---: | ---: | --- |
| Standard DualSense | `0x054c` | `0x0ce6` | None |
| DualSense Edge | `0x054c` | `0x0df2` | Function and rear controls |

Unknown or mismatched devices fail closed. The standard model remains on the
evdev input path. The Edge model additionally enables raw HID decoding for the
four extra controls, while the normal controls continue to use the same
generic input representation.

This raw-HID path is separate from the Bluetooth-only vds bridge: it is used
for Edge USB reports and is not a claim that USB is routed through
`vds_hcd`/`vdsd`.

The parser accepts the report forms currently covered by tests:

- USB report ID `0x01`, 64 bytes (companion raw-HID path only).
- Bluetooth report ID `0x31`, 78 bytes, with the expected CRC check. Some raw
  HID stacks may include the Bluetooth transport prefix `0xa1`; the parser
  accepts that form as well.

These are code-level format claims. No statement here means that USB or
Bluetooth operation, pairing, range, latency, or every firmware revision has
been verified on physical hardware.

## Edge report and input flow

The Edge parser decodes the standard sticks, triggers, face buttons, shoulder
buttons, system buttons, motion, and touch contacts into the existing
`ControllerInputState` shape plus Edge model metadata. In the Edge button byte,
the extra controls are named:

- `LFN` — left function button
- `RFN` — right function button
- `LB` — left rear paddle/button
- `RB` — right rear paddle/button

The names are represented in code as lowercase input keys: `lfn`, `rfn`, `lb`,
and `rb`. They enter the same generic flow as other buttons:

```text
raw Edge HID report
  → report validation and parsing
  → ControllerInputState / ControllerButton
  → generic remapping
  → chord detection and press-scoped consumption
  → Game Shortcuts actions
```

The existing evdev reader, `ControllerButton` type, shortcut settings,
remapping, chord engine, action executor, and notifications are reused. New
Edge-specific abstractions are the central model/capability classifier, the
USB/Bluetooth DualSense report decoder, and the raw-HID reader. The reader
joins raw HID to the corresponding evdev source identity; if that identity
cannot be proven, it drops the raw stream rather than creating duplicate
standard button events. Chord consumption can suppress the consumed Edge
button from the game while retaining the starter button, as covered by the
companion Edge test.

## Disconnect and reconnect status

The current implementation has these verified behaviors in source/tests:

- A raw HID error removes the Edge device, closes its handle, and emits a
  disconnect event.
- Evdev removal likewise emits a disconnect event when the source has no
  remaining nodes.
- Intentional reader shutdown does not report a false disconnect.
- A reader `rescan()` can enumerate an Edge HID device again after the old
  handle has been removed.
- On a physical Bluetooth backend loss, `vdsd` keeps the assigned virtual port
  registered, clears its companion input state, emits one neutral report, and
  reports the physical controller as disconnected.
- When the same configured controller reconnects while its virtual port still
  exists, the retained port/profile binding is reused and physical input/output
  forwarding is re-established.

The Edge raw-HID reader enumerates devices when started or explicitly rescanned. HID
permission failures, port removal, daemon shutdown, and unusual unplug/replug
timing still require manual verification for the transport and desktop/runtime
combination in use.

## Installation, permissions, and transport ownership

The documented installer installs `vdsd`, its systemd unit, and the bundled
udev rules; creates the `vds` group; and adds the selected user to that group
for vds control-socket access. A new group membership requires a new login
session. The `vds_hcd` module and `/dev/vds*` endpoints must also be present.

For the Bluetooth bridge, vds needs ownership of the controller's HID L2CAP channels.
The standard installer disables BlueZ's `input` plugin for this purpose. This
has the documented upstream trade-off that other Bluetooth input devices,
including keyboards and mice, do not work through that plugin while it is
disabled. The Edge raw-HID reader also needs permission to open the relevant
HID node. The repository's udev rules and the active desktop/session policy
must be checked on the target system; this document does not claim that every
distro grants `hidraw` access identically.

## Avoiding duplicate input

Use one logical controller path for a game. Do not stack independent
Steam Input, SDL remapping, Wine/Proton remapping, and OpenDS5 remapping for
the same physical buttons unless the resulting layers are intentional.

- With the vds bridge active, prefer the single virtual wired DualSense that
  the game sees.
- In Steam Input, avoid creating a second translation of the same Edge
  controls when OpenDS5 remapping or chords are enabled.
- SDL applications should select the intended virtual controller and avoid
  also reading the physical/raw node.
- Wine/Proton games should be checked for both the virtual XInput/evdev view
  and any directly exposed HID view; hide or disable the duplicate path when
  necessary.
- Native DualSense games should receive the virtual wired device's native
  reports. Test native output separately from OpenDS5 shortcut behavior.

The source-identity join protects the companion's own evdev/raw-HID fan-out,
but it cannot prevent an external remapper or compatibility layer from
enumerating the physical and virtual devices at the same time.

## Standard DualSense risks and known limitations

- Edge support is model-specific; do not expose Edge-only buttons for the
  standard `0x0ce6` model.
- Unsupported, short, malformed, or CRC-invalid reports are ignored.
- HID permission failures and device races are treated as expected open-time
  failures; they are not proof that the hardware is absent.
- Bluetooth input ownership depends on BlueZ configuration and conflicts with
  other Bluetooth input devices when the input plugin is disabled.
- The virtual wired identity does not guarantee that every game, SDL version,
  Wine/Proton build, Steam Input configuration, or native DualSense title
  will select the same device or preserve every output feature.
- No physical validation is claimed for LFN, RFN, LB, RB, touch, motion,
  adaptive triggers, haptics, rumble, speaker/microphone audio, lighting,
  USB, Bluetooth, or reconnect persistence; the lifecycle behavior above is
  source-level coverage until exercised on real hardware.

`Follen22/ds5-edge-relay` is mentioned only as a behavioral reference for
expected Edge control handling. No source was copied from it.

## Manual hardware checklist

Run the checks with a standard DualSense (`0x0ce6`) and an Edge (`0x0df2`)
where both are available. Record the transport, firmware, kernel, vds/OpenDS5
versions, and game/runtime used. A checked item is evidence for that setup
only; it is not a general capability claim.

### Discovery and input

- [ ] Confirm the physical device's VID/PID and that the classifier reports
      the correct standard or Edge model.
- [ ] Pair and test Bluetooth input with the BlueZ input-plugin ownership
      setting required by vds (the vds bridge path is Bluetooth-only).
- [ ] Connect and test USB raw-HID input separately; do not infer vds bridge
      support from successful USB parsing.
- [ ] Test d-pad, square, cross, circle, triangle, L1/R1, L2/R2, L3/R3,
      Create, Options, PS, mute, touchpad click, sticks, and trigger ranges.
- [ ] On Edge, test LFN, RFN, LB, and RB independently, including press and
      release, with no duplicate game events.
- [ ] Remap each Edge-only control to a standard button and verify one-to-many
      mappings if supported by the configured profile.
- [ ] Bind Edge-only controls as chord starters/consumed buttons; verify
      press-once behavior, release, reuse after release, and no unintended
      leakage to the game.
- [ ] Bind each Edge-only control to a Game Shortcut and verify the expected
      action, notification, and failure/manual fallback behavior.
- [ ] Repeat the input checks through the intended native game, Steam Input
      configuration, SDL application, and Wine/Proton title without enabling
      an accidental second input path.

### Output and reverse flow

- [ ] Verify game-driven classic rumble and OpenDS5 test rumble.
- [ ] Verify game-driven adaptive-trigger effects and OpenDS5 trigger
      profiles, including reset/neutral behavior when a profile stops.
- [ ] Verify game-driven and companion lightbar/player-indicator changes.
- [ ] Verify controller speaker/headset/microphone behavior where the chosen
      transport and vds audio setup support it; record failures separately
      from input failures.
- [ ] Verify native game haptics/audio-haptics independently from legacy
      rumble and do not label one as the other.
- [ ] Verify touch and motion output/input expectations separately if the
      application uses them.

### Lifecycle and recovery

- [ ] Unplug USB while idle and while a game is running; confirm disconnect
      reporting and absence of stuck buttons.
- [ ] Reconnect USB and verify raw-HID companion input, remaps, chords, and
      shortcuts after the required rescan/restart path. This does not exercise
      the vds virtual-device or output lifecycle.
- [ ] Disconnect Bluetooth, wait for the physical HID stream to disappear,
      then reconnect and verify the vds virtual device, input/output forwarding,
      remaps, chords, and shortcuts.
- [ ] Repeat rapid disconnect/reconnect and a controller power-cycle; record
      cases requiring an explicit rescan, app restart, service restart, or
      reapplication of settings.
- [ ] Confirm that stopping OpenDS5 does not leave a stale raw-HID handle or
      duplicate evdev stream, then verify a clean subsequent start.
