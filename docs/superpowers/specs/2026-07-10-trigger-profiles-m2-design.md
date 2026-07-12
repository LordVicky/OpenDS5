# Trigger Profiles M2 — Full Trigger Surface + Profile Sharing — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorm complete)
**Branch:** `trigger-profiles-m2`
**Builds on:** `docs/superpowers/specs/2026-07-08-adaptive-trigger-profiles-design.md` (M1)

## Problem

M1 shipped per-game trigger profiles, but two gaps limit their value:

1. **The effect vocabulary is a subset of the hardware.** The whole pipeline
   (companion protocol → vdsd → controller) carries only three modes —
   `feedback`, `weapon`, `vibration` — with three percent parameters. The
   DualSense trigger FFB block supports far more: 10-zone resistance maps,
   ramping (slope) resistance, and zoned vibration with adjustable frequency.
2. **Profiles cannot be shared.** There is no import/export and no way to
   discover community-made profiles, so per-game coverage cannot grow beyond
   what each user authors alone.

M2 fixes both, in that order: extend the effect pipeline to the full
documented trigger surface, then build sharing (import/export + an online
curated library) on top, so shared profiles use the full hardware from day
one and the format never needs a v2 migration.

Decision history: DSX-compatible UDP mod integration was evaluated and
rejected — the community profile/mod ecosystem is too thin to depend on, and
the project should not rely on a closed-source third party. Audio-reactive
modifiers move to **M3**.

## Goals

- Expose all documented DualSense trigger effect primitives in the profile
  schema, human-writable (friendly names, percent/Hz scales — no raw bytes).
- Import/export profiles as plain `.json` via the native file dialogs.
- In-app library browser fed from the repo (no app release needed to add a
  game); installs are explicit, validated, and never overwrite.
- Community contributions arrive as ordinary PRs against the repo.

## Non-goals

- Audio-reactive modifiers (M3).
- Custom library *URL* sources — file-picker import is the only custom door
  for now.
- DSX protocol compatibility or profile import.
- Undocumented factory sub-modes (bow, galloping, machine-gun variants):
  they are combinations of the documented primitives; named presets can be
  added later without schema changes.
- Bundling library profiles into the AppImage (the library is online-only,
  with an on-disk cache).

## Part 1 — Full trigger surface

### Effect vocabulary (shared schema)

`TriggerEffectSpec` becomes a discriminated union over `mode`; each mode
carries exactly its own fields so invalid combinations are unrepresentable:

```jsonc
// existing modes, unchanged shape:
{ "mode": "feedback",  "startPercent": 20, "forcePercent": 60 }
{ "mode": "weapon",    "startPercent": 15, "wallPercent": 45, "forcePercent": 80 }
{ "mode": "vibration", "startPercent": 10, "forcePercent": 70, "frequencyHz": 25 }

// new modes:
{ "mode": "multi-feedback",  "zones": [0, 0, 20, 40, 60, 80, 100, 100, 0, 0] }
{ "mode": "slope",           "startPercent": 20, "endPercent": 90,
                             "startForcePercent": 10, "endForcePercent": 100 }
{ "mode": "multi-vibration", "frequencyHz": 15,
                             "zones": [0, 0, 0, 50, 50, 100, 100, 0, 0, 0] }
{ "mode": "off" }
```

Validation rules:

- `zones`: exactly 10 integers, each 0–100 (percent strength/amplitude for
  that tenth of the trigger pull).
- `frequencyHz`: integer 1–255. Optional on `vibration` (default preserves
  current behavior); required on `multi-vibration`.
- All percents: integers 0–100. `slope` requires `endPercent > startPercent`.
- Unknown modes and unknown fields are rejected with an error that names the
  offending mode/field — this is also the message an old app shows for a
  newer profile.
- Schema stays `"version": 1`: additions are new union arms, and every
  M1 profile remains valid unchanged.

### Pipeline changes per layer

- **vdsd (C++):** `CompanionTriggerEffect` grows to a mode byte plus an
  11-byte params block matching the hardware FFB layout (vdsd already writes
  raw `left/right_trigger_ffb[11]`). One new companion command,
  `APPLY_ADAPTIVE_TRIGGER_EFFECT_V2`, carries the new payload; the existing
  command keeps working so old companions run against new daemons and vice
  versa. Friendly values (percent, Hz) translate to hardware bytes in a
  single well-tested daemon function.
- **Companion protocol (TS):** `AdaptiveTriggerPreviewEffect` becomes the
  discriminated union. The engine's dedupe/equality comparison and write
  chain are unchanged apart from comparing the union.
- **Trigger Lab & profile editor UI:** the mode picker gains the new modes.
  `multi-*` modes edit through a 10-slider zone strip (reusing the existing
  meter component); `slope` gets start/end position + force sliders. One
  shared effect-editor component serves Trigger Lab, the profile editor, and
  modifier effects.

## Part 2 — Profile sharing

### Profile metadata

Profiles gain one optional descriptive block, valid everywhere and required
for library entries:

```jsonc
"meta": {
  "game": "Cyberpunk 2077",        // display title in the library browser
  "author": "LordVicky",
  "description": "Weapon feel per trigger; heavy recoil on R2 rapid fire.",
  "source": "library"              // set on install: "library" | "import"; absent = locally created
}
```

`meta` is purely descriptive: the engine and matcher ignore it.

### Import / export

- **Export:** editor button → native save dialog defaulting to
  `<profile-name>.json`; writes the stored schema including `meta`.
- **Import:** strip-actions button → native open dialog (`.json` filter,
  multi-select). Per file: size cap (256 KB) → `JSON.parse` → strict
  validator → installed **always as a copy** (fresh id; name suffixed on
  collision, e.g. "Cyberpunk 2077 (2)"). Nothing is ever overwritten. A
  result toast lists successes and per-file validation errors.

### Library

**Repo side:**

```
profiles/
  library/
    index.json            // [{ file, name, game, author, description }]
    cyberpunk-2077.json
    ...
scripts/build-index.mjs   // regenerates index.json from the profile files
```

CI fails PRs whose index is stale or whose profiles fail the shared
validator (the script runs the same TS validator via a small node harness).
The library is seeded with a handful of first-party profiles.

**App side:**

- "Library" button in the profiles strip opens a browser panel: game, name,
  author, description, Install button per entry.
- Catalog source: `index.json` fetched from the repo raw URL (hardcoded
  constant pointing at `main`) when the panel opens. Install fetches that
  entry's profile file and runs it through the same validation-and-copy path
  as file import.
- Cache: last successful catalog persisted to `library-cache.json` with a
  timestamp shown in the UI.

### Security hardening

- Profiles are inert data; the validator (unknown fields rejected, typed
  ranges) is the trust boundary for both import and library install.
- Fetches: HTTPS only, 10 s timeout, index capped at 1 MB, profile files at
  256 KB, `JSON.parse` only.
- All catalog/metadata text is rendered as text (React escaping), never
  HTML, never used in file paths; installed files get freshly generated
  sanitized ids/filenames (existing store behavior).
- Nothing installs or updates without an explicit user click; provenance
  (`meta.source`) is visible in the UI.

### Failure behavior

- Fetch failure with a cache: show cached catalog + "couldn't refresh —
  showing cached list from <date>" banner.
- Fetch failure with no cache: clear error with the repo URL as plain text.
- Invalid library entry: that entry shows an error state; others install
  fine.

## Testing

- **vdsd:** unit tests for the percent/Hz → FFB byte translation, per mode,
  including boundary values; V2 command parse/validation tests.
- **Companion (vitest):** validator accept/reject matrices for every union
  arm; import pipeline (copy semantics, name suffixing, size cap, malformed
  JSON, multi-file partial failure); catalog parsing, cache write/fallback,
  and failure banners with a mocked fetch; engine dedupe over the union.
- **E2E:** a `multi-feedback` profile threads from JSON through the engine
  to a mock sink asserting the V2 payload bytes.
- **Repo:** CI check that `index.json` is in sync and all library profiles
  validate.

## Milestones after M2

- **M3:** audio-reactive modifiers (PipeWire DSP path; spike-over-baseline
  transient conditions preferred over absolute thresholds).
- **Later:** named effect presets (bow/galloping-style), custom library URL
  sources, pinning arbitrary profiles from chip long-press.
