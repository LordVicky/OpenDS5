# Adaptive Trigger Profiles for Unsupported Games — Design

**Date:** 2026-07-08
**Status:** Approved (brainstorm complete)
**Branch:** `adaptive-trigger-profiles`

## Problem

The DualSense adaptive triggers only do anything in games that natively speak
the DualSense protocol. Everything else — most Linux/Proton titles — leaves the
triggers inert. The bridge already has the plumbing to *apply* effects
(`PREVIEW_ADAPTIVE_TRIGGER_EFFECT` / `APPLY_ADAPTIVE_TRIGGER_EFFECT`, Trigger
Lab, trigger trace). What's missing is a system that decides **when** and
**which** effect to apply for games that know nothing about the controller.

## Goals

- Per-game profiles combining static base effects with reactive modifiers.
- Automatic profile activation by detecting the running game, with manual
  override always available.
- Native JSON profile format designed for a future DSX importer (out of scope
  here).
- **M1 (this design):** profile system, game detection, static effects,
  input-reactive modifiers.
- **M2 (future):** audio-reactive modifiers reusing the PipeWire
  audio-reactive-haptics DSP path. The schema reserves room for it; no format
  change required.

## Non-goals

- DSX profile import (follow-up feature).
- Daemon-side (vdsd) rule evaluation. Latency-sensitive paths may move later;
  M1 lives entirely in the companion app (Approach A). Alternative approaches
  considered: rule engine inside vdsd (lowest latency, but grows a policy
  engine in C++ and still needs userspace game detection) and a separate
  profile daemon (a third moving piece, overkill).

## Architecture

All new code lives in the Electron **main process**, alongside the existing
bridge-service / settings-store modules:

```
GameWatcher ──active game──▶ TriggerProfileEngine ──effects──▶ bridge-service ──▶ vdsd ──▶ controller
                                   ▲          ▲
                     profiles (JSON store)    input reports (existing status/trace stream)
```

`TriggerProfileEngine` is the **single writer** of trigger effects while a
profile is active, and suspends itself whenever Trigger Lab preview/test runs,
resuming the active profile afterward.

## Profile schema

Profiles are JSON documents in `~/.config/ds5-bridge/trigger-profiles/*.json`:

```jsonc
{
  "name": "Generic Shooter",
  "match": {                          // any match activates the profile
    "processNames": ["Cyberpunk2077.exe", "cyberpunk2077"],
    "windowTitles": ["Cyberpunk*"]    // glob, best-effort (see detection)
  },
  "triggers": {
    "l2": {
      "base": { "mode": "feedback", "params": { /* AdaptiveTriggerPreviewEffect shape */ } },
      "modifiers": [
        {
          "when": { "source": "input", "condition": "trigger-held-over",
                    "threshold": 128, "ms": 300 },
          "effect": { "mode": "vibration", "params": { /* ... */ } }
        }
      ]
    },
    "r2": { "base": { "mode": "weapon", "params": { /* ... */ } }, "modifiers": [] }
  }
}
```

- `base` reuses the exact effect shape Trigger Lab previews
  (`AdaptiveTriggerPreviewEffect` in `src/shared/types.ts` /
  `src/shared/protocol.ts`), so profiles are authored with the existing UI
  controls.
- `modifiers` is an ordered list; **first matching modifier wins** per
  trigger; if none match, `base` applies.
- M1 condition vocabulary (`"source": "input"`):
  - `trigger-held-over` — trigger value above `threshold` for `ms`
  - `trigger-full-pull` — trigger at max
  - `button-held` — named button currently held
  - `rapid-fire` — trigger presses per second above a rate
- `"source": "audio"` is reserved for M2; the validator accepts but ignores it
  (with a UI note "requires M2").
- A built-in **Default** profile applies when nothing matches. It ships as
  "no effects" and is user-editable like any other profile, but cannot be
  deleted and has no `match` block.
- Validation: unknown fields rejected, schema version field `"version": 1`
  for forward migration.

## Game detection

`GameWatcher` (main process):

- Polls `/proc` every **2 s** for candidate processes. Matches
  `processNames` against both the comm/exe basename and the Wine/Proton exe
  name found in `/proc/<pid>/cmdline` (covers native, Proton, and Flatpak).
- Window-title matching is **best-effort**: queried on X11/XWayland via the
  active-window API; silently skipped on pure Wayland sessions.
- **Priority:** manual pin (UI dropdown or controller chord) > process match >
  window match > Default.
- If multiple profiles match at the same priority tier, the most recently
  modified profile wins and the UI shows a conflict hint.
- Activation and deactivation are **debounced ~5 s** so alt-tabbing or brief
  process churn doesn't thrash effects.

## Effect composition & application

- **Activation:** apply each trigger's `base` via
  `APPLY_ADAPTIVE_TRIGGER_EFFECT`.
- **Per input report** (existing status/trace stream the companion already
  receives): evaluate each trigger's modifiers top-to-bottom; resolve the
  effective effect; write to the controller **only if it differs** from the
  currently applied effect (dedupe — no report-rate spam).
- **Deactivation / app exit / controller disconnect:**
  `RESET_ADAPTIVE_TRIGGERS`.
- **Conflicts:** engine suspends while Trigger Lab preview/test is active and
  while the global `adaptiveTriggersEnabled` toggle is off; resumes cleanly.
- Reactive latency is bounded by the companion's report cadence. Acceptable
  for resistance-style changes; faster paths (daemon-side evaluation) are an
  explicit later investigation, not part of M1.

## UI

New **Trigger Profiles** panel in the renderer:

- Profile list: create, duplicate, delete, import/export JSON.
- Active-profile indicator with manual pin control; status strip like
  `Active: Generic Shooter (matched: cyberpunk2077)`.
- Editor: embeds the existing Trigger Lab effect controls for `base` per
  trigger, plus a modifier list (condition dropdown + parameters + effect).
- New IPC surface follows the existing preload/protocol patterns
  (`src/preload.ts`, `src/shared/protocol.ts`).

## Testing

- **Unit:** schema validation (accept/reject cases, version field); matcher
  priority and debounce with mocked process lists; modifier evaluation with
  synthetic input reports asserting expected applied effects and dedupe
  behavior; suspend/resume around Trigger Lab.
- **E2E:** via `DS5_BRIDGE_MOCK_CONTROLLER` mock transport — activate a
  profile, feed mock trigger input, assert the mock received the expected
  effect writes and the reset on deactivation.
- TDD throughout, per repo practice.
