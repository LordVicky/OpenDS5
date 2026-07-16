# Multi-State Trigger Profiles — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorm complete)
**Branch:** `Multi-State-Trigger-Profiles`
**Builds on:** `docs/superpowers/specs/2026-07-08-adaptive-trigger-profiles-design.md` (M1),
`docs/superpowers/specs/2026-07-10-trigger-profiles-m2-design.md` (M2)

## Problem

A trigger profile is one fixed effect set per trigger for the whole session —
the README calls this out honestly as "one feel per game". Real games swap
weapons and vehicles constantly, and a profile that feels right for a pistol
feels wrong for a shotgun. The profile system has no way to express "several
feels for one game" or to change feel mid-session without opening the app.

The deeper limitation ("they react to your finger, not the game") cannot be
fully fixed without game cooperation, but a large slice of it can: the player
already tells the controller when they swap weapons — by pressing the game's
swap button. We see every button on the input stream the modifier evaluator
already consumes.

## Goals

- Profiles may define multiple named **states** ("Pistol", "Shotgun",
  "Driving"), each a complete per-trigger effect set (base + modifiers).
- **Switching rules** map controller buttons to state changes, so the feel
  follows the game's own controls (Triangle = swap weapon → cycle state;
  D-pad right = slot 2 → select state).
- A **menu guard** suspends rule inference while the game is presumed to be
  in a menu, so browsing an inventory doesn't corrupt the tracked state.
- Manual state selection from the UI at any time (the correction mechanism
  when inference drifts).
- Schema stays `"version": 1`; every existing profile remains valid and
  behaves exactly as before.

## Non-goals

- Game-state ingestion over UDP (DSX-format listener / opends5-helper) —
  that is the follow-up layer; when it lands it drives the same
  select-state entry point this design introduces.
- Haptic/lightbar confirmation pulses on state switch (nice-to-have
  follow-up).
- Weapon-wheel stick-sector rules (needs stick axes in the input state;
  follow-up).
- PS-chord bindings through the settings chord system — rules can already
  express chords via the optional `while` button.

## Tracking model (honest ceiling)

Switching is **open-loop inference** from controller input. The game is the
only source of truth and we never see it, so the design optimizes for being
right most of the time and cheap to correct when wrong:

- **Select rules are self-healing** — every press of an absolute slot
  binding re-anchors the state regardless of accumulated drift.
- **Cycle rules drift** (the game may block a swap we counted) — the menu
  guard removes the most common corruption source, and manual selection is
  always one click away.
- **Re-entry is conservative** — profile activation and controller
  reconnect start from the declared default state, never stale inference.

## Profile schema

Two new optional top-level fields; both absent on every existing profile:

```jsonc
{
  "version": 1,
  "name": "Cyberpunk 2077",
  "match": { "processNames": ["Cyberpunk2077.exe"], "windowTitles": [] },
  "triggers": { /* unchanged; mirrors states[0] when states exist (see below) */ },
  "states": [
    { "name": "Pistol",  "triggers": { "l2": { /* slot */ }, "r2": { /* slot */ } } },
    { "name": "Shotgun", "triggers": { /* ... */ } }
  ],
  "switching": {
    "defaultState": "Pistol",          // optional; defaults to states[0]
    "rules": [
      { "button": "triangle",   "action": "cycle" },
      { "button": "dpad-right", "action": "select", "state": "Shotgun" },
      { "button": "r1", "while": "ps", "action": "cycle" }   // chord-style
    ],
    "menuButtons": ["options"],        // toggle the menu guard
    "menuTimeoutMs": 30000             // auto-release the guard (0/absent = never)
  },
  "updatedAtMs": 0
}
```

- `states` — when present and non-empty, the runtime state list. Each state
  is a full `{ l2, r2 }` slot pair (same shape as `triggers`, same effect
  union, same modifiers). Names are non-empty, unique, ≤ 32 chars; at most
  12 states.
- **`triggers` mirrors `states[0]`** whenever `states` exists. The editor
  maintains this invariant on save. It keeps every consumer that predates
  states (`triggerProfileHasEffects`, library tooling) meaningful, and a
  profile stripped of its `states` field degrades to its first state.
- `switching.rules` — ordered, first matching rule per pressed button wins,
  at most 16. `button`/`while` come from the known-button vocabulary below.
  `select` requires `state` naming an existing state; `cycle` forbids it.
- `switching` requires `states`; validation rejects it otherwise. Unknown
  fields/buttons/actions are rejected with the offending path — which is
  also the message an old app shows for a newer profile, matching the M2
  compatibility stance.

### Known buttons

The evdev reader grows from 8 to 15 buttons; the shared vocabulary is:

`cross`, `circle`, `triangle`, `square`, `l1`, `r1`, `l3`, `r3`,
`create`, `options`, `ps`, `dpad-up`, `dpad-down`, `dpad-left`,
`dpad-right`.

D-pad directions are synthesized from `ABS_HAT0X`/`ABS_HAT0Y`; `create`,
`options`, `ps` map from `BTN_SELECT`/`BTN_START`/`BTN_MODE`. The
`button-held` modifier keeps accepting free text (unchanged), but switch
rules validate against this list so the rule editor can be a dropdown.

## Runtime

### StateSwitcher (shared, pure)

A small shared class beside `ModifierEvaluator`, fed the same
`ControllerInputState` stream:

- Edge-detects presses (in current set, not in previous) so a held button
  fires once.
- Menu guard: pressing any `menuButtons` entry toggles `menuSuspended`;
  while suspended, switch rules are ignored. `menuTimeoutMs` releases the
  guard after quiet time as a backstop for menus closed by other means.
- On a pressed button, the first rule whose `button` matches and whose
  `while` button (if any) is currently held applies: `cycle` → next state
  (wraps), `select` → named state.
- `select(name)` — the manual/IPC entry point, bypasses the guard.
- Reset to the default state on profile change.

### Engine integration

`TriggerProfileEngine` keeps the active state index and resolves an
**effective slot pair** — `states[index].triggers` when states exist,
`profile.triggers` otherwise — everywhere it reads `profile.triggers`
today:

- `onInput` runs the switcher before modifier evaluation; a state change
  re-applies bases through the existing write chain (dedupe unchanged) and
  emits status. The early-out for "no modifiers" also considers switching
  rules, since the input stream now drives both.
- The `ModifierEvaluator` is re-pointed at the new state's slots on every
  switch — its existing profile-change reset gives correct per-state
  timing behavior for free.
- `EngineStatus` gains `activeStateName: string | null` (null when the
  active profile has no states).
- New IPC `bridge:selectTriggerProfileState(name)` → manual selection,
  returned/broadcast through the existing status channel.
- Draft preview is unchanged: the editor previews the state currently
  being edited as a plain slot pair.

Without evdev access (`input` group missing), switching rules are inert
exactly like modifiers today: the default state's bases still apply. The
README limitation note extends to say so.

## UI

- **Editor — States strip** above the two trigger slot cards: chips for
  each state (click to edit that state's effects), add/rename/delete/
  duplicate. Profiles without states show the strip in its single-state
  form with an "Add state" affordance that seeds `states[0]` from the
  current `triggers`.
- **Editor — Switching group** beside Identity & Matching: rule rows
  (button dropdown, action dropdown, target-state dropdown when `select`,
  optional `while` dropdown), menu-guard button picker and timeout field.
- **Status** — the engine heading and `formatEngineStatusLine` include the
  active state (`Active: Cyberpunk 2077 — Shotgun`); when the active
  profile has states, the page shows a state chip row for one-click manual
  correction via the new IPC.

## Testing

- **Schema (vitest):** accept/reject matrices for `states` and `switching`
  (name uniqueness/caps, rule button/action/state validation, `switching`
  without `states` rejected, `triggers`-mirror unaffected); every M1/M2
  fixture still validates unchanged.
- **StateSwitcher:** edge detection (no repeat while held), cycle wrap,
  select self-anchor, `while` chords, menu-guard toggle + timeout release,
  default-state reset on profile change, unknown buttons ignored.
- **Reader:** synthetic evdev records for d-pad hat, `create`/`options`/
  `ps` key codes.
- **Engine:** state switch re-applies bases exactly once (dedupe), status
  carries `activeStateName`, manual `selectState`, modifiers evaluate
  against the active state's slots, states-less profiles take the legacy
  path byte-for-byte.
- **E2E:** mock transport — activate a two-state profile, feed a switch
  press, assert the new state's base effect write.
