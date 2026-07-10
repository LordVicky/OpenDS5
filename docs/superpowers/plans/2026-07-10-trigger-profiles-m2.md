# Trigger Profiles M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the trigger-effect pipeline to the full documented DualSense trigger surface (multi-zone feedback, slope, multi-zone vibration, off), then add profile sharing: JSON import/export via native dialogs and an in-app library browser fed from the repo.

**Architecture:** The effect type becomes a discriminated union over `mode` shared by schema, protocol, engine, and UI. vdsd gains a V2 companion command (0x21) carrying the new parameter payloads and translates friendly percents/Hz to hardware FFB bytes in `encode_companion_trigger_effect_v2`. Sharing sits entirely in the companion main process: import/export IPC using Electron dialogs, and a library fetcher that pulls `profiles/library/index.json` from the repo raw URL with an on-disk cache. All entries install through the same validate-then-copy path.

**Tech Stack:** C++20 (vdsd), TypeScript + Electron + React (companion), vitest, CMake.

**Spec:** `docs/superpowers/specs/2026-07-10-trigger-profiles-m2-design.md`

## Global Constraints

- Profile schema stays `"version": 1`; every existing M1 profile must validate unchanged.
- New effect modes: `multi-feedback`, `slope`, `multi-vibration`, `off`. Existing: `feedback`, `weapon`, `vibration` (+ optional `frequencyHz` on vibration).
- `zones`: exactly 10 integers 0–100. `frequencyHz`: integer 1–255. All percents: integers 0–100. `slope` requires `endPercent > startPercent`.
- Unknown modes/fields rejected with an error naming the offender.
- Imports/installs are ALWAYS copies (fresh id, name suffixed on collision); never overwrite.
- Fetches: HTTPS only, 10 s timeout, index ≤ 1 MB, profile files ≤ 256 KB, `JSON.parse` only. No user-configurable URLs.
- Old daemon + new companion and new daemon + old companion must both keep working (V2 is a new command id; V1 path untouched).
- Companion tests: `npx vitest run` from `ds5-bridge/companion/`; typecheck: `npm run typecheck`.
- All commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Phase A — Full trigger surface

### Task 1: Effect union in the shared schema + validator

**Files:**
- Modify: `ds5-bridge/companion/src/shared/trigger-profiles.ts`
- Modify: `ds5-bridge/companion/src/shared/protocol.ts`
- Test: `ds5-bridge/companion/src/shared/trigger-profiles.test.ts` (extend existing)

**Interfaces:**
- Consumes: existing `TriggerTestMode`, `validateTriggerProfile(raw): ValidationResult`.
- Produces (later tasks rely on these exact names):
  ```ts
  // protocol.ts
  export type TriggerEffectMode = 'off' | 'feedback' | 'weapon' | 'vibration' | 'multi-feedback' | 'slope' | 'multi-vibration';
  export type AdaptiveTriggerEffectV2 =
    | { mode: 'off' }
    | { mode: 'feedback'; startPercent: number; forcePercent: number }
    | { mode: 'weapon'; startPercent: number; wallPercent: number; forcePercent: number }
    | { mode: 'vibration'; startPercent: number; forcePercent: number; frequencyHz?: number }
    | { mode: 'multi-feedback'; zones: number[] }
    | { mode: 'slope'; startPercent: number; endPercent: number; startForcePercent: number; endForcePercent: number }
    | { mode: 'multi-vibration'; frequencyHz: number; zones: number[] };
  export type AdaptiveTriggerEffectV2Targeted = AdaptiveTriggerEffectV2 & { target: TriggerTestTarget };
  // trigger-profiles.ts
  export type TriggerEffectSpec = AdaptiveTriggerEffectV2;  // re-export alias; M1 shape remains a valid union arm
  export function effectSpecEquals(a: TriggerEffectSpec | null, b: TriggerEffectSpec | null): boolean;
  export function defaultEffectForMode(mode: TriggerEffectMode): TriggerEffectSpec;
  ```
- M1 compat rule: the validator ACCEPTS legacy objects `{ mode: 'feedback'|'weapon'|'vibration', startPercent, wallPercent, forcePercent }` and normalizes them to the union arm (dropping `wallPercent` where the arm lacks it). `validateTriggerProfile` returns the normalized profile.

- [ ] **Step 1: Write failing validator tests** — in `trigger-profiles.test.ts` add a `describe('effect union validation')` block:

```ts
const baseProfile = () => ({
  version: 1, id: 'p', name: 'P',
  match: { processNames: [], windowTitles: [] },
  triggers: { l2: { base: null, modifiers: [] }, r2: { base: null, modifiers: [] } },
  updatedAtMs: 0
});

function withBase(base: unknown) {
  const profile = baseProfile();
  (profile.triggers.l2 as { base: unknown }).base = base;
  return profile;
}

describe('effect union validation', () => {
  it('accepts every new mode arm', () => {
    for (const base of [
      { mode: 'off' },
      { mode: 'multi-feedback', zones: [0, 10, 20, 30, 40, 50, 60, 70, 80, 100] },
      { mode: 'slope', startPercent: 20, endPercent: 90, startForcePercent: 10, endForcePercent: 100 },
      { mode: 'multi-vibration', frequencyHz: 15, zones: [0, 0, 0, 50, 50, 100, 100, 0, 0, 0] },
      { mode: 'vibration', startPercent: 10, forcePercent: 70, frequencyHz: 25 }
    ]) {
      expect(validateTriggerProfile(withBase(base)).ok, JSON.stringify(base)).toBe(true);
    }
  });

  it('normalizes legacy 4-field effects to union arms', () => {
    const result = validateTriggerProfile(withBase(
      { mode: 'feedback', startPercent: 20, wallPercent: 0, forcePercent: 60 }
    ));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.triggers.l2.base).toEqual({ mode: 'feedback', startPercent: 20, forcePercent: 60 });
    }
  });

  it('rejects bad arms with errors naming the offender', () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ mode: 'laser' }, /laser/],
      [{ mode: 'multi-feedback', zones: [1, 2, 3] }, /zones/],
      [{ mode: 'multi-feedback', zones: [0,0,0,0,0,0,0,0,0,101] }, /zones/],
      [{ mode: 'multi-vibration', zones: [0,0,0,0,0,0,0,0,0,0] }, /frequencyHz/],
      [{ mode: 'multi-vibration', frequencyHz: 0, zones: [0,0,0,0,0,0,0,0,0,0] }, /frequencyHz/],
      [{ mode: 'slope', startPercent: 90, endPercent: 20, startForcePercent: 0, endForcePercent: 100 }, /endPercent/],
      [{ mode: 'feedback', startPercent: 20, forcePercent: 60, zones: [0,0,0,0,0,0,0,0,0,0] }, /zones/]
    ];
    for (const [base, pattern] of cases) {
      const result = validateTriggerProfile(withBase(base));
      expect(result.ok, JSON.stringify(base)).toBe(false);
      if (!result.ok) expect(result.error).toMatch(pattern);
    }
  });

  it('effectSpecEquals compares union arms deeply', () => {
    const a = { mode: 'multi-feedback', zones: [0,1,2,3,4,5,6,7,8,9] } as const;
    expect(effectSpecEquals(a, { ...a, zones: [...a.zones] })).toBe(true);
    expect(effectSpecEquals(a, { ...a, zones: [0,1,2,3,4,5,6,7,8,10] })).toBe(false);
    expect(effectSpecEquals(null, { mode: 'off' })).toBe(false);
    expect(effectSpecEquals(null, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/shared/trigger-profiles.test.ts` → FAIL (`effectSpecEquals` not exported; new modes rejected).

- [ ] **Step 3: Implement** — in `protocol.ts` add `TriggerEffectMode`, `AdaptiveTriggerEffectV2`, `AdaptiveTriggerEffectV2Targeted` (keep `TriggerTestMode`/`AdaptiveTriggerPreviewEffect` untouched for the V1 path). In `trigger-profiles.ts`: replace the `TriggerEffectSpec` interface with the alias; write `validateEffectSpec(raw, path): { ok: true; effect: TriggerEffectSpec } | { ok: false; error: string }` handling per-arm required/forbidden fields (build an allowed-key set per mode; reject extras naming field and path), zone/frequency/percent range checks, legacy normalization (arm has `wallPercent` only for `weapon`; legacy `vibration` maps `wallPercent` → dropped); call it from `validateTriggerProfile` for every `base` and modifier `effect`. Implement `effectSpecEquals` (mode check + per-arm field compare, `zones` element-wise) and `defaultEffectForMode` (sensible defaults: zones all 0 except indices 4–7 at 60; slope 20→90, 10→100; vibration frequencyHz 25).

- [ ] **Step 4: Run full suite** — `npx vitest run && npm run typecheck`. Fix compile fallout in `trigger-modifier-eval.ts`, `trigger-profile-engine.ts` (switch `effectEquals` to `effectSpecEquals`), and any UI code that constructs effects (use `defaultEffectForMode('feedback')` where `defaultTriggerEffectSpec()` existed — keep that function as a wrapper). Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A ds5-bridge/companion/src && git commit -m "feat(m2): trigger effect discriminated union with legacy normalization"`

### Task 2: vdsd V2 encoder + command 0x21

**Files:**
- Modify: `vds/src/vds_protocol.hh` (~line 94), `vds/src/vds_protocol.cc` (~line 499)
- Modify: `vds/src/vds_companion.hh` (~line 53), `vds/src/vds_companion.cc` (~line 346)
- Modify: `vds/src/platform/linux/vdsd.cc` (~line 2030–2080)
- Create: `vds/tests/trigger_effect_v2_test.cc`, modify `vds/CMakeLists.txt`

**Interfaces:**
- Consumes: existing `encode_companion_trigger_effect`, `CompanionTriggerEffect`, helpers `trigger_position_from_percent`, `trigger_strength_from_percent`, `set_trigger_zones`, `kTriggerEffectSize` (11).
- Produces:
  ```cpp
  // vds_companion.hh — extend, don't break aggregate init used elsewhere:
  struct CompanionTriggerEffect {
    bool active = false;
    std::uint8_t mode = 0;        // V1: 0 fb,1 weapon,2 vib. V2: 3 off,4 multi-fb,5 slope,6 multi-vib
    std::uint8_t target = 0;
    std::uint8_t start_percent = 0, wall_percent = 0, force_percent = 0;
    std::uint8_t frequency_hz = 0;                    // V2 vibration/multi-vibration
    std::array<std::uint8_t, 10> zone_percents{};     // V2 multi-* modes
    std::uint8_t end_percent = 0, end_force_percent = 0; // V2 slope
  };
  // vds_protocol.hh:
  void encode_companion_trigger_effect_v2(
      std::span<std::uint8_t, kTriggerEffectSize> trigger,
      const CompanionTriggerEffect &effect);
  ```
- Wire command **0x21 APPLY_ADAPTIVE_TRIGGER_EFFECT_V2**: `value = mode | (target << 8)`; payload at `report[11..]`: modes 0–2 → `[start, wall, force, frequency_hz]`; mode 3 (off) → none; mode 4 → 10 zone bytes; mode 5 → `[start, end, start_force, end_force]`; mode 6 → `[frequency_hz, zone0..zone9]`. Validation mirrors the TS validator (percents ≤ 100, freq 1–255, slope end > start); invalid → `kAckErrInvalidValue`. Storage/reset identical to 0x20.

- [ ] **Step 1: Write failing C++ test** — `vds/tests/trigger_effect_v2_test.cc`, plain asserts (repo has no test framework):

```cpp
#include <cassert>
#include <cstdio>
#include <span>
#include "../src/vds_protocol.hh"
#include "../src/vds_companion.hh"

int main() {
  std::array<std::uint8_t, vds::kTriggerEffectSize> buffer{};
  auto span = std::span<std::uint8_t, vds::kTriggerEffectSize>(buffer);

  vds::CompanionTriggerEffect off{.active = true, .mode = 3};
  vds::encode_companion_trigger_effect_v2(span, off);
  assert(buffer[0] == 0x05); // kTriggerEffectOff

  vds::CompanionTriggerEffect multi{.active = true, .mode = 4};
  multi.zone_percents = {0, 0, 100, 100, 0, 0, 0, 0, 0, 0};
  vds::encode_companion_trigger_effect_v2(span, multi);
  assert(buffer[0] == 0x21); // kTriggerEffectFeedback
  assert((buffer[1] | (buffer[2] << 8)) == 0b0000001100); // zones 2,3 active
  assert(buffer[3] != 0);   // strength codes packed for zones 2..3

  vds::CompanionTriggerEffect slope{.active = true, .mode = 5,
      .start_percent = 20, .end_percent = 90, .end_force_percent = 100};
  slope.force_percent = 10; // start force reuses force_percent
  vds::encode_companion_trigger_effect_v2(span, slope);
  assert(buffer[0] == 0x22); // kTriggerEffectSlope

  vds::CompanionTriggerEffect vib{.active = true, .mode = 6, .frequency_hz = 15};
  vib.zone_percents = {0, 0, 0, 50, 50, 100, 100, 0, 0, 0};
  vds::encode_companion_trigger_effect_v2(span, vib);
  assert(buffer[0] == 0x26); // kTriggerEffectVibration
  assert(buffer[9] == 15);

  std::puts("trigger_effect_v2_test OK");
  return 0;
}
```

(Verify the actual `kTriggerEffect*` constant values in `vds_protocol.cc` before finalizing asserts — the DS5 FFB opcodes there are the source of truth; slope = `0x22` per DualSense docs, add the constant if missing.)

- [ ] **Step 2: Add CMake target and verify failure** — in `vds/CMakeLists.txt` add `add_executable(trigger_effect_v2_test tests/trigger_effect_v2_test.cc src/vds_protocol.cc)` (plus needed srcs). Run `cmake -S vds -B vds/build && make -C vds/build trigger_effect_v2_test` → compile FAIL (`encode_companion_trigger_effect_v2` undeclared).

- [ ] **Step 3: Implement encoder** — in `vds_protocol.cc`: `encode_companion_trigger_effect_v2` switches on `effect.mode`; modes 0–2 delegate to the existing V1 encoder (vibration additionally writes `trigger[9] = frequency_hz` when nonzero); mode 3 `set_trigger_off`; mode 4 packs 10 zone strength codes via the existing 3-bit `scale_strength_code` packing over an active-zone bitmask; mode 5 writes the slope block (opcode, start/end positions via `trigger_position_from_percent`, start/end strengths); mode 6 like 4 with vibration opcode + `trigger[9] = frequency_hz`. Extend `CompanionTriggerEffect` in `vds_companion.hh` as above.

- [ ] **Step 4: Run test** — `make -C vds/build trigger_effect_v2_test && ./vds/build/trigger_effect_v2_test` → `trigger_effect_v2_test OK`.

- [ ] **Step 5: Wire command 0x21 + call site** — in `vds_companion.cc` add `case 0x21:` parsing per the payload table above into the extended struct (same both/left/right storage as 0x20). In `platform/linux/vdsd.cc` `apply_companion_state`, replace the four `encode_companion_trigger_effect(...)` calls with `encode_companion_trigger_effect_v2(span, effect)` (V1 commands populate the same struct fields, so one encoder serves both). Build full daemon: `make -C vds/build` → clean.

- [ ] **Step 6: Commit** — `git add vds && git commit -m "feat(m2): vdsd V2 trigger effect command with full FFB surface"`

### Task 3: Companion transport V2 + engine union

**Files:**
- Modify: `ds5-bridge/companion/src/shared/protocol.ts` (COMMAND_ID)
- Modify: `ds5-bridge/companion/src/main/bridge-service.ts` (~line 3026)
- Modify: `ds5-bridge/companion/src/main/trigger-profile-engine.ts`
- Test: `ds5-bridge/companion/src/main/trigger-profile-engine.test.ts`, `ds5-bridge/companion/src/main/bridge-service.test.ts`

**Interfaces:**
- Consumes: Task 1 union + `effectSpecEquals`; Task 2 payload layout.
- Produces:
  ```ts
  // protocol.ts: COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT_V2: 0x21
  // bridge-service.ts:
  async applyAdaptiveTriggerEffectV2(effect: AdaptiveTriggerEffectV2Targeted): Promise<BridgeSnapshot>
  // trigger-profile-engine.ts TriggerEffectSink gains:
  applyAdaptiveTriggerEffectV2(effect: AdaptiveTriggerEffectV2Targeted): Promise<unknown>;
  ```
- Engine rule: effects whose mode is `feedback`/`weapon`/`vibration`-without-frequencyHz keep using the V1 sink call (old daemons still work); anything else goes through V2. Mode/payload byte mapping mirrors Task 2 exactly (mode bytes: off=3, multi-feedback=4, slope=5, multi-vibration=6).

- [ ] **Step 1: Failing engine test** — extend the mock sink in `trigger-profile-engine.test.ts` with `applyAdaptiveTriggerEffectV2` recording calls; test that a profile with base `{ mode: 'multi-feedback', zones: [...] }` produces one V2 call with those zones and no V1 call, while a plain `feedback` base still uses the V1 call; and that `effectSpecEquals` dedupe suppresses a second identical write.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/main/trigger-profile-engine.test.ts` → FAIL.

- [ ] **Step 3: Implement** — add `APPLY_ADAPTIVE_TRIGGER_EFFECT_V2: 0x21` to `COMMAND_ID`; implement `applyAdaptiveTriggerEffectV2` in bridge-service building `value = modeByte | targetByte << 8` and `extraPayload` per the Task 2 table; in the engine's `writeDesired`, route per effect arm (`needsV2(effect)` helper) and swap `effectEquals` for `effectSpecEquals`. The zero-force "relax" write stays V1 (works on all daemons).

- [ ] **Step 4: Full suite + typecheck** — `npx vitest run && npm run typecheck` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(m2): route full-surface effects through V2 companion command"`

### Task 4: Effect editor UI for the new modes

**Files:**
- Create: `ds5-bridge/companion/src/renderer/TriggerEffectEditor.tsx`
- Modify: `ds5-bridge/companion/src/renderer/App.tsx` (profile editor slot cards ~line 7600; Trigger Lab card), `ds5-bridge/companion/src/renderer/styles.css`
- Test: `ds5-bridge/companion/src/renderer/app-behavior.test.ts`

**Interfaces:**
- Consumes: Task 1 `TriggerEffectSpec`, `defaultEffectForMode`; existing `TriggerLabMeter` component and `trigger-lab-mode-grid` styles.
- Produces:
  ```tsx
  export function TriggerEffectEditor(props: {
    label: string;                       // aria prefix, e.g. "Left Trigger"
    value: TriggerEffectSpec;
    onChange: (effect: TriggerEffectSpec) => void;
    onCommit?: (effect: TriggerEffectSpec) => void;
  }): JSX.Element;
  ```
- Behavior: mode grid with all 7 modes (labels: Off, Feedback, Weapon, Vibration, Multi Feedback, Slope, Multi Vibration); switching modes calls `onChange(defaultEffectForMode(mode))`. Per-arm controls: percent rows reuse `TriggerLabMeter`; `zones` renders ten compact vertical sliders (`trigger-zone-strip` CSS class, one `TriggerLabMeter` rotated or a plain `<input type="range">` column — match existing visual language); `frequencyHz` a numeric field 1–255.

- [ ] **Step 1: Failing behavior-guard test** — in `app-behavior.test.ts`: assert `appSource` (or the new component file read the same way) contains the seven mode labels and that `App.tsx` renders `<TriggerEffectEditor` in both the profile slot card and Trigger Lab card regions (use source-scan style consistent with existing guards).

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/renderer/app-behavior.test.ts` → FAIL.

- [ ] **Step 3: Implement component** — build `TriggerEffectEditor.tsx` per the interface; replace the inline mode-grid + three-meter block in the profile editor slot cards AND the equivalent controls in Trigger Lab with the component (Trigger Lab keeps its own preview-dispatch wiring; it adapts its existing state to/from `TriggerEffectSpec`). Add `.trigger-zone-strip` styles (10 columns, 4px gap, value labels under each).

- [ ] **Step 4: Suite + typecheck + eyeball** — `npx vitest run && npm run typecheck` → PASS. Launch dev app (`DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE=1 npm run dev`) and verify each mode edits and previews on hardware.

- [ ] **Step 5: Commit** — `git commit -am "feat(m2): shared effect editor exposing full trigger surface"`

## Phase B — Sharing foundations

### Task 5: `meta` block + import/export IPC

**Files:**
- Modify: `ds5-bridge/companion/src/shared/trigger-profiles.ts` (validator), `ds5-bridge/companion/src/main/trigger-profile-store.ts`, `ds5-bridge/companion/src/main/main.ts` (registerIpc), `ds5-bridge/companion/src/preload.ts`
- Test: `ds5-bridge/companion/src/main/trigger-profile-store.test.ts`, `ds5-bridge/companion/src/shared/trigger-profiles.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // trigger-profiles.ts
  export interface TriggerProfileMeta { game?: string; author?: string; description?: string; source?: 'library' | 'import'; }
  // TriggerProfile gains: meta?: TriggerProfileMeta   (all fields strings ≤ 500 chars; unknown meta keys rejected)
  // trigger-profile-store.ts
  importProfile(parsed: unknown, source: 'library' | 'import'): { ok: true; profile: TriggerProfile } | { ok: false; error: string };
  // Always-copy: fresh id via slug+suffix, name suffixed " (2)", " (3)"… on collision, meta.source stamped.
  // IPC (main.ts + preload):
  'bridge:exportTriggerProfile' (id) → shows save dialog, writes JSON; returns { saved: boolean; path?: string }
  'bridge:importTriggerProfiles' () → open dialog (json, multiSelections) → per-file result list
  export const MAX_PROFILE_FILE_BYTES = 262144;
  ```

- [ ] **Step 1: Failing store tests** — `importProfile` assigns a fresh id when the incoming id exists; suffixes colliding names; stamps `meta.source`; rejects unknown meta keys and >500-char fields; a 300 KB JSON string is rejected by the IPC-level size guard (test the exported `MAX_PROFILE_FILE_BYTES` check helper `readProfileFileForImport(path)`).

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/main/trigger-profile-store.test.ts` → FAIL.

- [ ] **Step 3: Implement** — validator: `meta` optional object, whitelist keys, string+length checks. Store: `importProfile` (validate → strip/replace id with `uniqueTriggerProfileId`-style slug → collision-suffix name against `list()` → `save`). Main: two `ipcMain.handle` entries using `dialog.showSaveDialog` / `dialog.showOpenDialog` with `filters: [{ name: 'Trigger Profiles', extensions: ['json'] }]`; import path: stat size ≤ `MAX_PROFILE_FILE_BYTES` → `readFileSync` → `JSON.parse` in try/catch → `importProfile(parsed, 'import')`; collect `{ file, ok, error?, name? }[]`. Preload: expose `exportTriggerProfile(id)`, `importTriggerProfiles()`.

- [ ] **Step 4: Suite + typecheck** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(m2): profile meta block and import/export IPC with copy semantics"`

### Task 6: Import/Export UI

**Files:**
- Modify: `ds5-bridge/companion/src/renderer/App.tsx` (strip actions ~line 7900; editor header), `ds5-bridge/companion/src/renderer/styles.css`, `ds5-bridge/companion/src/renderer/global.d.ts`
- Test: `ds5-bridge/companion/src/renderer/app-behavior.test.ts`

**Interfaces:** Consumes Task 5 IPC. Produces: "Import" button in `trigger-profiles-strip-actions` (icon `Upload`, before New); "Export" secondary button in the editor header next to Save (disabled when no draft). After import: refresh profile list, select the first imported profile, toast-style summary using the existing notification pattern (`pushNotification` if present in App.tsx, else the established status-badge pattern — check and follow).

- [ ] **Step 1: Failing behavior guards** — source-scan tests: strip actions contain `Import`, editor header contains `Export`, both wired to `window.bridge.importTriggerProfiles` / `exportTriggerProfile`.
- [ ] **Step 2: Verify failure** → FAIL.
- [ ] **Step 3: Implement** buttons + handlers + `global.d.ts` bridge typings.
- [ ] **Step 4: Suite + typecheck + eyeball** (export a profile, re-import it, confirm "(2)" copy appears) → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(m2): import/export buttons in trigger profiles UI"`

## Phase C — Library

### Task 7: Repo library + index builder + CI

**Files:**
- Create: `profiles/library/index.json`, `profiles/library/default-showcase.json` (seed: one first-party profile demonstrating multi-feedback + slope), `scripts/build-index.mjs`
- Modify: `.github/workflows/` (add `library-check.yml`; check existing workflow layout first and follow it)

**Interfaces:**
- Produces index format consumed by Task 8:
  ```json
  [{ "file": "default-showcase.json", "name": "Showcase", "game": "Any", "author": "LordVicky", "description": "Demonstrates multi-zone feedback (L2) and slope (R2)." }]
  ```
- `node scripts/build-index.mjs` regenerates `index.json` from `profiles/library/*.json` (reads each profile's `meta` + `name`); `node scripts/build-index.mjs --check` exits 1 when out of sync. The script validates every profile by importing the compiled validator via `npx tsx` against `ds5-bridge/companion/src/shared/trigger-profiles.ts`.

- [ ] **Step 1: Write the script + seed profile** (script is its own test: `--check` red/green).
- [ ] **Step 2: Verify** — corrupt a field in the seed profile → `--check` exits 1 with the validator error; fix → exits 0.
- [ ] **Step 3: CI job** — workflow runs `node scripts/build-index.mjs --check` on PRs touching `profiles/**`.
- [ ] **Step 4: Commit** — `git commit -am "feat(m2): repo profile library with index builder and CI sync check"`

### Task 8: Library fetcher + cache (main process)

**Files:**
- Create: `ds5-bridge/companion/src/main/profile-library.ts`
- Modify: `ds5-bridge/companion/src/main/main.ts`, `ds5-bridge/companion/src/preload.ts`
- Test: `ds5-bridge/companion/src/main/profile-library.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const LIBRARY_INDEX_URL = 'https://raw.githubusercontent.com/LordVicky/Virtual-DS5-Bridge/main/profiles/library/index.json';
  export const MAX_INDEX_BYTES = 1048576;
  export interface LibraryEntry { file: string; name: string; game: string; author: string; description: string; }
  export interface LibraryCatalog { entries: LibraryEntry[]; fetchedAtMs: number; fromCache: boolean; error?: string; }
  export class ProfileLibrary {
    constructor(cacheDir: string, fetchImpl?: typeof fetch);
    getCatalog(): Promise<LibraryCatalog>;    // fetch → validate shape → write cache; on failure → cached or error
    fetchProfile(entry: LibraryEntry): Promise<unknown>;  // parsed JSON of one profile, ≤ MAX_PROFILE_FILE_BYTES, file name sanitized to /^[a-z0-9-]+\.json$/
  }
  // IPC: 'bridge:getProfileLibraryCatalog', 'bridge:installLibraryProfile' (entry) → store.importProfile(parsed, 'library')
  ```

- [ ] **Step 1: Failing tests with mocked fetch** — success populates cache (`library-cache.json` in cacheDir) and `fromCache: false`; network throw → cached entries + `fromCache: true` + `error` set; no cache → `entries: []` + `error`; index > 1 MB rejected; entry with `file: '../evil.json'` rejected by `fetchProfile`; 10 s timeout via `AbortSignal.timeout` (assert the signal is passed).
- [ ] **Step 2: Verify failure** → FAIL.
- [ ] **Step 3: Implement** per interface (Node ≥ 18 global fetch; `JSON.parse` only; entry-shape whitelist).
- [ ] **Step 4: Suite + typecheck** → PASS.
- [ ] **Step 5: Wire IPC + preload, commit** — `git commit -am "feat(m2): profile library fetcher with disk cache and install IPC"`

### Task 9: Library browser UI

**Files:**
- Modify: `ds5-bridge/companion/src/renderer/App.tsx`, `styles.css`, `global.d.ts`
- Test: `ds5-bridge/companion/src/renderer/app-behavior.test.ts`

**Interfaces:** Consumes Task 8 IPC. Produces: "Library" button (icon `BookOpen`) in `trigger-profiles-strip-actions`; opens a panel (existing overlay/popover pattern — match the game-detect popover or settings panel, whichever fits the size) listing entries (game — name — author — description) with per-entry Install; stale banner `Couldn't refresh — showing cached list from <date>` when `fromCache`; error + repo URL as plain text when `entries` empty with `error`; per-entry error state on failed install; installed entries show `meta.source` provenance ("From library") in the editor header area.

- [ ] **Step 1: Failing behavior guards** (Library button, banner strings, `installLibraryProfile` wiring).
- [ ] **Step 2: Verify failure** → FAIL.
- [ ] **Step 3: Implement panel + provenance line.**
- [ ] **Step 4: Suite + typecheck + eyeball online and offline** (disconnect network → banner). → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(m2): in-app library browser with cache fallback"`

## Phase D — Wrap-up

### Task 10: E2E test + docs

**Files:**
- Modify: `ds5-bridge/companion/src/main/trigger-profiles-e2e.test.ts`, `README.md`

- [ ] **Step 1: E2E test** — thread a profile JSON with a `multi-feedback` L2 base and `slope` R2 base through store → engine (mock watcher match) → mock sink; assert one V2 call per trigger with exact union payloads; then import the same JSON via `importProfile` and assert copy semantics end-to-end.
- [ ] **Step 2: Run** — `npx vitest run` → PASS.
- [ ] **Step 3: README** — extend the Trigger Profiles section: new effect modes table (mode → fields → feel), import/export, library ("Add a game via PR to `profiles/library/` — run `node scripts/build-index.mjs`"), note that full-surface modes need a current vdsd (`update-vdsd.sh`).
- [ ] **Step 4: Full verification** — `npm run typecheck && npx vitest run` and `make -C vds/build && ./vds/build/trigger_effect_v2_test`; hardware pass: each new mode felt on the controller from a profile.
- [ ] **Step 5: Commit** — `git commit -am "test(m2): e2e full-surface profile flow + docs"`
