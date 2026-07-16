# Stick-Wheel State Selection for Multi-State Trigger Profiles

**Date:** 2026-07-16
**Branch:** Multi-State-Trigger-Profiles
**Status:** Approved design, pending implementation plan

## Problem

Multi-state switching is open-loop inference from button presses. In games that
select weapons with an analog weapon wheel (hold a button, point the left
stick, release), cycle rules drift immediately and chord-select rules don't
match how players actually pick weapons. Tracking needs to follow the same
gesture the game itself uses.

## Goal

Mirror the in-game weapon wheel: while the wheel button is held, the left
stick's direction picks a sector; releasing the button commits that sector's
state. Sector layout, stick threshold, and rotation are configurable per
profile through a radial wheel UI, so the mapping can be tuned per game
against the game's own wheel art.

Out of scope (explicitly deferred): d-pad slot mapping in the configurator,
right-stick support, always-armed flick selection.

## Schema

`StateSwitching` gains one optional block:

```ts
export interface StickWheelConfig {
  button: string;            // chord button that arms the wheel (KNOWN_BUTTONS)
  thresholdPercent: number;  // stick magnitude needed to register, 1-100
  angleOffsetDeg: number;    // rotates sector boundaries, 0-359
  sectors: (string | null)[]; // 2-12 entries, clockwise from 12 o'clock; state name or null
}

export interface StateSwitching {
  // ...existing fields...
  stickWheel?: StickWheelConfig;
}
```

Validation rules (in `validateTriggerProfile` / `validateSwitching`):

- `button` must be in `KNOWN_BUTTONS`.
- `thresholdPercent` integer 1-100; `angleOffsetDeg` integer 0-359.
- `sectors` length 2-12; every non-null entry must name an existing state.
- `stickWheel` requires `states` (same rule as `switching` itself).
- New exported constants: `MAX_WHEEL_SECTORS = 12`, `MIN_WHEEL_SECTORS = 2`.

Compatibility: apps that predate `stickWheel` reject the profile with an
"unknown field" error, identical to how pre-states apps reject `states`.
Export/import and the community library carry the block untouched.

## Input reader

`EvdevInputReader` additionally decodes `ABS_X` (code 0) and `ABS_Y` (code 1)
— the left stick, 0-255, centered at 128 — and `ControllerInputState` gains
`lx` and `ly` (raw 0-255, defaulting to 128 before the first event). No
behavioral change for consumers that ignore the new fields.

## Switcher

`StateSwitcher.update()` grows a wheel-gesture tracker alongside the existing
rule loop:

- **Arm** when `stickWheel.button` appears in the button set. While armed,
  ordinary switch rules whose `button` equals the wheel button do not fire
  (the wheel owns that button); all other rules behave as today.
- **Track** on every update while armed: magnitude
  `sqrt(dx^2 + dy^2) / 128 * 100` (dx = lx-128, dy = ly-128) and angle
  `atan2(dx, -dy)` (0 deg = 12 o'clock, clockwise). When magnitude >=
  `thresholdPercent`, the sector index is
  `floor(((angle - angleOffsetDeg + 360) % 360) / (360 / sectors.length))`;
  remember it if that sector's entry is non-null. Last valid sector wins.
- **Commit** when the wheel button leaves the button set: if a sector was
  remembered, select its state (same effect as a `select` rule — a manual
  re-anchor). If the stick never crossed the threshold, nothing changes and
  the release is otherwise ignored by the wheel logic.
- **Menu guard interaction:** the wheel gesture ignores the menu guard in both
  directions — holding the wheel button neither raises the guard nor is
  blocked by it. The wheel button is the game's own "menu"; its guard is the
  arm/commit lifecycle itself. (Profiles should not list the wheel button in
  `menuButtons`; the validator rejects a profile whose wheel button also
  appears in `menuButtons`.)
- `setProfile()` resets any in-flight gesture.

## UI: wheel configurator

Lives in the **State Switching** card of the profile editor, below the rules
list, behind an "Analog wheel" enable toggle.

- **Radial SVG wheel:** N equal sectors rendered clockwise from 12 o'clock
  (after rotation). Sector count picker (2-12). Clicking a sector opens a
  state dropdown (any state, or Unassigned). Assigned sectors show the state
  name; unassigned sectors render dimmed.
- **Wheel button picker:** dropdown over `KNOWN_BUTTONS` (default: triangle).
- **Threshold slider (1-100):** drawn live as an inner dead-zone circle on the
  wheel.
- **Angle offset slider (0-359):** rotates the rendered sector boundaries.
- **Live stick preview:** while the editor is open and input access works, a
  dot shows the real left-stick position over the wheel and the sector under
  it highlights. This is the per-game tuning loop: open the game's wheel
  side by side and nudge offset/threshold until sectors line up. Reuses the
  input stream the state chips already subscribe to; when input access is
  unavailable the wheel simply renders without the dot (same degradation as
  switch rules).
- Renames/removals of states propagate into `sectors` the same way they do
  into rules (rename follows, removal nulls the sector).

## Data flow

Editor writes `switching.stickWheel` -> profile store -> engine passes the
profile to `StateSwitcher` (no engine changes beyond the enriched
`ControllerInputState`) -> switcher emits the same state-change events the
chips/status line already consume.

## Error handling

- Validator rejects malformed `stickWheel` with field-level messages
  (consistent with existing `switching` errors).
- Reader: missing ABS_X/Y events leave lx/ly at 128 (centered) — wheel simply
  never crosses threshold.
- Sector entries naming deleted states are nulled by the editor; the switcher
  additionally treats unknown names as null defensively.

## Testing

- **Sector math:** angle->sector across offsets, wrap-around at 0/360,
  threshold boundary (>= crosses, < doesn't), non-square axis values.
- **Switcher lifecycle:** arm/track/commit happy path; release without
  threshold = no change; wander across sectors commits the last valid one;
  null sectors skipped; wheel button excluded from rule matching while armed;
  menu guard non-interaction; setProfile resets gesture.
- **Reader:** ABS_X/ABS_Y decoding into lx/ly, defaults at 128.
- **Validation:** every rejection path above, plus round-trip through
  export/import.
- **UI:** visual smoke via the existing harness; unit tests for the
  sector-geometry helpers shared with the switcher.
