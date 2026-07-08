# Adaptive Trigger Profiles (M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-game adaptive trigger profiles for games with no native DualSense support: static base effects plus input-reactive modifiers, auto-activated by game detection with manual override.

**Architecture:** All new code lives in the Electron main process of the companion app (`ds5-bridge/companion`). A `GameWatcher` polls `/proc` for running games; an `EvdevInputReader` streams live trigger/button state from the virtual DualSense's evdev node; a `TriggerProfileEngine` composes profile base effects and modifier overrides and writes them through the existing `BridgeService.applyAdaptiveTriggerEffect()` / `resetAdaptiveTriggers()` methods (deduped). Spec: `docs/superpowers/specs/2026-07-08-adaptive-trigger-profiles-design.md`.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React (renderer), vitest, pure Node (`node:fs`, `node:events`) — no new dependencies.

## Global Constraints

- Working directory for all commands: `ds5-bridge/companion` (repo root `~/Virtual-DS5-Bridge`).
- Test command: `npx vitest run <file>` per task; full suite `npm run test:companion` must stay green.
- Typecheck: `npm run typecheck` must pass before each commit.
- No changes to `vds/` (daemon) in M1.
- No new npm dependencies.
- Profile schema `"version": 1`; unknown top-level fields rejected.
- Effect shape reuses `AdaptiveTriggerPreviewEffect` fields (`mode`, `startPercent`, `wallPercent`, `forcePercent`; `target` derived per trigger).
- `"source": "audio"` conditions are accepted by the validator but never evaluated in M1.
- TDD: write the failing test first in every task.
- Deferred within M1 (schema/API already accommodate them; small fast-follows, not in these tasks): window-title matching (best-effort X11) and pinning a profile via controller chord — the pin IPC (`bridge:pinTriggerProfile`) is the hook a chord function will call.

---

### Task 1: Profile schema types + validation (`shared/trigger-profiles.ts`)

**Files:**
- Create: `src/shared/trigger-profiles.ts`
- Test: `src/shared/trigger-profiles.test.ts`

**Interfaces:**
- Consumes: `TriggerTestMode` from `src/shared/protocol.ts`.
- Produces (used by Tasks 2, 3, 6, 7, 8):

```ts
export interface TriggerEffectSpec {
  mode: TriggerTestMode;          // 'feedback' | 'weapon' | 'vibration'
  startPercent: number;           // 0-100
  wallPercent: number;            // 0-100
  forcePercent: number;           // 0-100
}
export type InputConditionType = 'trigger-held-over' | 'trigger-full-pull' | 'button-held' | 'rapid-fire';
export interface ModifierCondition {
  source: 'input' | 'audio';
  condition: InputConditionType | string;  // audio conditions opaque in M1
  threshold?: number;             // trigger-held-over: 0-255
  ms?: number;                    // trigger-held-over: hold duration
  button?: string;                // button-held: e.g. 'cross', 'l1'
  pressesPerSecond?: number;      // rapid-fire
}
export interface TriggerModifier { when: ModifierCondition; effect: TriggerEffectSpec; }
export interface TriggerSlotConfig { base: TriggerEffectSpec | null; modifiers: TriggerModifier[]; }
export interface ProfileMatch { processNames: string[]; windowTitles: string[]; }
export interface TriggerProfile {
  version: 1;
  id: string;                     // slug, unique; 'default' reserved
  name: string;
  match: ProfileMatch;            // Default profile: both arrays empty
  triggers: { l2: TriggerSlotConfig; r2: TriggerSlotConfig };
  updatedAtMs: number;
}
export function validateTriggerProfile(raw: unknown): { ok: true; profile: TriggerProfile } | { ok: false; error: string };
export function createDefaultProfile(): TriggerProfile;  // id 'default', no effects, empty match
```

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/trigger-profiles.test.ts
import { describe, expect, it } from 'vitest';
import { createDefaultProfile, validateTriggerProfile } from './trigger-profiles';

const valid = {
  version: 1,
  id: 'generic-shooter',
  name: 'Generic Shooter',
  match: { processNames: ['cyberpunk2077.exe'], windowTitles: [] },
  triggers: {
    l2: { base: { mode: 'feedback', startPercent: 20, wallPercent: 60, forcePercent: 80 }, modifiers: [] },
    r2: {
      base: { mode: 'weapon', startPercent: 10, wallPercent: 40, forcePercent: 90 },
      modifiers: [{
        when: { source: 'input', condition: 'trigger-held-over', threshold: 128, ms: 300 },
        effect: { mode: 'vibration', startPercent: 0, wallPercent: 0, forcePercent: 60 }
      }]
    }
  },
  updatedAtMs: 1000
};

describe('validateTriggerProfile', () => {
  it('accepts a valid profile', () => {
    const result = validateTriggerProfile(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.id).toBe('generic-shooter');
  });

  it('rejects unknown top-level fields', () => {
    const result = validateTriggerProfile({ ...valid, bogus: true });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('bogus') });
  });

  it('rejects unsupported version', () => {
    expect(validateTriggerProfile({ ...valid, version: 2 }).ok).toBe(false);
  });

  it('rejects out-of-range percents', () => {
    const bad = structuredClone(valid);
    bad.triggers.l2.base.forcePercent = 150;
    expect(validateTriggerProfile(bad).ok).toBe(false);
  });

  it('accepts audio-source modifiers without validating their condition', () => {
    const withAudio = structuredClone(valid);
    withAudio.triggers.r2.modifiers.push({
      when: { source: 'audio', condition: 'transient-kick' },
      effect: { mode: 'vibration', startPercent: 0, wallPercent: 0, forcePercent: 100 }
    });
    expect(validateTriggerProfile(withAudio).ok).toBe(true);
  });

  it('rejects unknown input condition types', () => {
    const bad = structuredClone(valid);
    bad.triggers.r2.modifiers[0].when.condition = 'moon-phase';
    expect(validateTriggerProfile(bad).ok).toBe(false);
  });
});

describe('createDefaultProfile', () => {
  it('creates the reserved default profile with no effects and no match', () => {
    const profile = createDefaultProfile();
    expect(profile.id).toBe('default');
    expect(profile.match).toEqual({ processNames: [], windowTitles: [] });
    expect(profile.triggers.l2.base).toBeNull();
    expect(profile.triggers.r2.base).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/trigger-profiles.test.ts`
Expected: FAIL — cannot resolve `./trigger-profiles`.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/trigger-profiles.ts
import type { TriggerTestMode } from './protocol';

export interface TriggerEffectSpec {
  mode: TriggerTestMode;
  startPercent: number;
  wallPercent: number;
  forcePercent: number;
}

export type InputConditionType = 'trigger-held-over' | 'trigger-full-pull' | 'button-held' | 'rapid-fire';

export interface ModifierCondition {
  source: 'input' | 'audio';
  condition: InputConditionType | string;
  threshold?: number;
  ms?: number;
  button?: string;
  pressesPerSecond?: number;
}

export interface TriggerModifier {
  when: ModifierCondition;
  effect: TriggerEffectSpec;
}

export interface TriggerSlotConfig {
  base: TriggerEffectSpec | null;
  modifiers: TriggerModifier[];
}

export interface ProfileMatch {
  processNames: string[];
  windowTitles: string[];
}

export interface TriggerProfile {
  version: 1;
  id: string;
  name: string;
  match: ProfileMatch;
  triggers: { l2: TriggerSlotConfig; r2: TriggerSlotConfig };
  updatedAtMs: number;
}

export const DEFAULT_PROFILE_ID = 'default';

const PROFILE_KEYS = ['version', 'id', 'name', 'match', 'triggers', 'updatedAtMs'];
const TRIGGER_MODES: TriggerTestMode[] = ['feedback', 'weapon', 'vibration'];
const INPUT_CONDITIONS: InputConditionType[] = [
  'trigger-held-over',
  'trigger-full-pull',
  'button-held',
  'rapid-fire'
];

type ValidationResult = { ok: true; profile: TriggerProfile } | { ok: false; error: string };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function validateEffect(raw: unknown, path: string): string | null {
  if (!isRecord(raw)) return `${path} must be an object`;
  if (!TRIGGER_MODES.includes(raw.mode as TriggerTestMode)) return `${path}.mode is invalid`;
  for (const key of ['startPercent', 'wallPercent', 'forcePercent'] as const) {
    if (!isPercent(raw[key])) return `${path}.${key} must be 0-100`;
  }
  return null;
}

function validateModifier(raw: unknown, path: string): string | null {
  if (!isRecord(raw) || !isRecord(raw.when)) return `${path}.when must be an object`;
  const when = raw.when;
  if (when.source !== 'input' && when.source !== 'audio') return `${path}.when.source is invalid`;
  if (when.source === 'input' && !INPUT_CONDITIONS.includes(when.condition as InputConditionType)) {
    return `${path}.when.condition is not a known input condition`;
  }
  return validateEffect(raw.effect, `${path}.effect`);
}

function validateSlot(raw: unknown, path: string): string | null {
  if (!isRecord(raw)) return `${path} must be an object`;
  if (raw.base !== null) {
    const error = validateEffect(raw.base, `${path}.base`);
    if (error) return error;
  }
  if (!Array.isArray(raw.modifiers)) return `${path}.modifiers must be an array`;
  for (let index = 0; index < raw.modifiers.length; index += 1) {
    const error = validateModifier(raw.modifiers[index], `${path}.modifiers[${index}]`);
    if (error) return error;
  }
  return null;
}

export function validateTriggerProfile(raw: unknown): ValidationResult {
  if (!isRecord(raw)) return fail('profile must be an object');
  for (const key of Object.keys(raw)) {
    if (!PROFILE_KEYS.includes(key)) return fail(`unknown field: ${key}`);
  }
  if (raw.version !== 1) return fail('unsupported profile version');
  if (typeof raw.id !== 'string' || raw.id.length === 0) return fail('id must be a non-empty string');
  if (typeof raw.name !== 'string' || raw.name.length === 0) return fail('name must be a non-empty string');
  if (!isRecord(raw.match) || !isStringArray(raw.match.processNames) || !isStringArray(raw.match.windowTitles)) {
    return fail('match must contain processNames and windowTitles string arrays');
  }
  if (!isRecord(raw.triggers)) return fail('triggers must be an object');
  for (const slot of ['l2', 'r2'] as const) {
    const error = validateSlot(raw.triggers[slot], `triggers.${slot}`);
    if (error) return fail(error);
  }
  if (typeof raw.updatedAtMs !== 'number') return fail('updatedAtMs must be a number');
  return { ok: true, profile: raw as unknown as TriggerProfile };
}

export function createDefaultProfile(): TriggerProfile {
  return {
    version: 1,
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    match: { processNames: [], windowTitles: [] },
    triggers: {
      l2: { base: null, modifiers: [] },
      r2: { base: null, modifiers: [] }
    },
    updatedAtMs: 0
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/trigger-profiles.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/trigger-profiles.ts src/shared/trigger-profiles.test.ts
git commit -m "feat: add trigger profile schema types and validation"
```

---

### Task 2: Modifier evaluator (`shared/trigger-modifier-eval.ts`)

**Files:**
- Create: `src/shared/trigger-modifier-eval.ts`
- Test: `src/shared/trigger-modifier-eval.test.ts`

**Interfaces:**
- Consumes: `TriggerProfile`, `TriggerEffectSpec`, `TriggerSlotConfig` from Task 1.
- Produces (used by Task 6):

```ts
export interface ControllerInputState {
  timestampMs: number;
  l2: number;                       // raw 0-255
  r2: number;                       // raw 0-255
  buttons: ReadonlySet<string>;     // held button names: 'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l3', 'r3'
}
export interface ResolvedTriggerEffects {
  l2: TriggerEffectSpec | null;     // null = no effect (reset state) for that trigger
  r2: TriggerEffectSpec | null;
}
export class ModifierEvaluator {
  setProfile(profile: TriggerProfile | null): void;   // resets internal timing state
  update(state: ControllerInputState): ResolvedTriggerEffects;
}
```

Semantics: per trigger, walk `modifiers` top-to-bottom; the first modifier whose input condition currently holds wins; otherwise `base`. Audio-source modifiers never match in M1. Condition semantics:
- `trigger-held-over`: that trigger's raw value has been `>= threshold` continuously for `ms` milliseconds (default threshold 128, default ms 0).
- `trigger-full-pull`: raw value `>= 250`.
- `button-held`: `state.buttons.has(button)`.
- `rapid-fire`: rising edges of that trigger crossing 128, counted in a sliding 1000 ms window, `>= pressesPerSecond` (default 3).

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/trigger-modifier-eval.test.ts
import { describe, expect, it } from 'vitest';
import { ModifierEvaluator, type ControllerInputState } from './trigger-modifier-eval';
import type { TriggerProfile } from './trigger-profiles';

const baseEffect = { mode: 'feedback' as const, startPercent: 20, wallPercent: 60, forcePercent: 80 };
const kickEffect = { mode: 'vibration' as const, startPercent: 0, wallPercent: 0, forcePercent: 60 };

function makeProfile(r2Modifiers: TriggerProfile['triggers']['r2']['modifiers']): TriggerProfile {
  return {
    version: 1,
    id: 'test',
    name: 'Test',
    match: { processNames: [], windowTitles: [] },
    triggers: {
      l2: { base: null, modifiers: [] },
      r2: { base: baseEffect, modifiers: r2Modifiers }
    },
    updatedAtMs: 0
  };
}

function state(overrides: Partial<ControllerInputState>): ControllerInputState {
  return { timestampMs: 0, l2: 0, r2: 0, buttons: new Set(), ...overrides };
}

describe('ModifierEvaluator', () => {
  it('returns base effect when no modifier matches', () => {
    const evaluator = new ModifierEvaluator();
    evaluator.setProfile(makeProfile([]));
    const resolved = evaluator.update(state({ timestampMs: 0 }));
    expect(resolved.r2).toEqual(baseEffect);
    expect(resolved.l2).toBeNull();
  });

  it('applies trigger-held-over only after the hold duration elapses', () => {
    const evaluator = new ModifierEvaluator();
    evaluator.setProfile(makeProfile([
      { when: { source: 'input', condition: 'trigger-held-over', threshold: 128, ms: 300 }, effect: kickEffect }
    ]));
    expect(evaluator.update(state({ timestampMs: 0, r2: 200 })).r2).toEqual(baseEffect);
    expect(evaluator.update(state({ timestampMs: 200, r2: 200 })).r2).toEqual(baseEffect);
    expect(evaluator.update(state({ timestampMs: 350, r2: 200 })).r2).toEqual(kickEffect);
    expect(evaluator.update(state({ timestampMs: 400, r2: 0 })).r2).toEqual(baseEffect);
  });

  it('matches trigger-full-pull at raw value >= 250', () => {
    const evaluator = new ModifierEvaluator();
    evaluator.setProfile(makeProfile([
      { when: { source: 'input', condition: 'trigger-full-pull' }, effect: kickEffect }
    ]));
    expect(evaluator.update(state({ timestampMs: 0, r2: 249 })).r2).toEqual(baseEffect);
    expect(evaluator.update(state({ timestampMs: 10, r2: 255 })).r2).toEqual(kickEffect);
  });

  it('matches button-held', () => {
    const evaluator = new ModifierEvaluator();
    evaluator.setProfile(makeProfile([
      { when: { source: 'input', condition: 'button-held', button: 'l1' }, effect: kickEffect }
    ]));
    expect(evaluator.update(state({ timestampMs: 0, buttons: new Set(['l1']) })).r2).toEqual(kickEffect);
  });

  it('matches rapid-fire on trigger press rate in a sliding window', () => {
    const evaluator = new ModifierEvaluator();
    evaluator.setProfile(makeProfile([
      { when: { source: 'input', condition: 'rapid-fire', pressesPerSecond: 3 }, effect: kickEffect }
    ]));
    let t = 0;
    for (let press = 0; press < 3; press += 1) {
      evaluator.update(state({ timestampMs: t, r2: 200 }));
      evaluator.update(state({ timestampMs: t + 50, r2: 0 }));
      t += 200;
    }
    expect(evaluator.update(state({ timestampMs: t, r2: 200 })).r2).toEqual(kickEffect);
  });

  it('first matching modifier wins', () => {
    const other = { mode: 'weapon' as const, startPercent: 5, wallPercent: 50, forcePercent: 50 };
    const evaluator = new ModifierEvaluator();
    evaluator.setProfile(makeProfile([
      { when: { source: 'input', condition: 'trigger-full-pull' }, effect: kickEffect },
      { when: { source: 'input', condition: 'button-held', button: 'l1' }, effect: other }
    ]));
    const resolved = evaluator.update(state({ timestampMs: 0, r2: 255, buttons: new Set(['l1']) }));
    expect(resolved.r2).toEqual(kickEffect);
  });

  it('never matches audio-source modifiers in M1', () => {
    const evaluator = new ModifierEvaluator();
    evaluator.setProfile(makeProfile([
      { when: { source: 'audio', condition: 'transient-kick' }, effect: kickEffect }
    ]));
    expect(evaluator.update(state({ timestampMs: 0, r2: 255 })).r2).toEqual(baseEffect);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/trigger-modifier-eval.test.ts`
Expected: FAIL — cannot resolve `./trigger-modifier-eval`.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/trigger-modifier-eval.ts
import type { ModifierCondition, TriggerEffectSpec, TriggerProfile, TriggerSlotConfig } from './trigger-profiles';

export interface ControllerInputState {
  timestampMs: number;
  l2: number;
  r2: number;
  buttons: ReadonlySet<string>;
}

export interface ResolvedTriggerEffects {
  l2: TriggerEffectSpec | null;
  r2: TriggerEffectSpec | null;
}

const FULL_PULL_THRESHOLD = 250;
const DEFAULT_HOLD_THRESHOLD = 128;
const RAPID_FIRE_EDGE_THRESHOLD = 128;
const RAPID_FIRE_WINDOW_MS = 1000;
const DEFAULT_PRESSES_PER_SECOND = 3;

type TriggerName = 'l2' | 'r2';

class TriggerTimingState {
  heldSinceMs: number | null = null;
  lastValue = 0;
  pressTimestampsMs: number[] = [];

  reset(): void {
    this.heldSinceMs = null;
    this.lastValue = 0;
    this.pressTimestampsMs = [];
  }
}

export class ModifierEvaluator {
  private profile: TriggerProfile | null = null;
  private timing: Record<TriggerName, TriggerTimingState> = {
    l2: new TriggerTimingState(),
    r2: new TriggerTimingState()
  };

  setProfile(profile: TriggerProfile | null): void {
    this.profile = profile;
    this.timing.l2.reset();
    this.timing.r2.reset();
  }

  update(state: ControllerInputState): ResolvedTriggerEffects {
    this.trackTiming('l2', state.l2, state.timestampMs);
    this.trackTiming('r2', state.r2, state.timestampMs);
    if (!this.profile) {
      return { l2: null, r2: null };
    }
    return {
      l2: this.resolveSlot('l2', this.profile.triggers.l2, state),
      r2: this.resolveSlot('r2', this.profile.triggers.r2, state)
    };
  }

  private trackTiming(trigger: TriggerName, value: number, timestampMs: number): void {
    const timing = this.timing[trigger];
    if (value >= RAPID_FIRE_EDGE_THRESHOLD && timing.lastValue < RAPID_FIRE_EDGE_THRESHOLD) {
      timing.pressTimestampsMs.push(timestampMs);
    }
    timing.pressTimestampsMs = timing.pressTimestampsMs.filter(
      (at) => timestampMs - at <= RAPID_FIRE_WINDOW_MS
    );
    timing.lastValue = value;
  }

  private resolveSlot(
    trigger: TriggerName,
    slot: TriggerSlotConfig,
    state: ControllerInputState
  ): TriggerEffectSpec | null {
    for (const modifier of slot.modifiers) {
      if (this.conditionHolds(trigger, modifier.when, state)) {
        return modifier.effect;
      }
    }
    return slot.base;
  }

  private conditionHolds(
    trigger: TriggerName,
    when: ModifierCondition,
    state: ControllerInputState
  ): boolean {
    if (when.source !== 'input') {
      return false;
    }
    const value = trigger === 'l2' ? state.l2 : state.r2;
    const timing = this.timing[trigger];
    switch (when.condition) {
      case 'trigger-held-over': {
        const threshold = when.threshold ?? DEFAULT_HOLD_THRESHOLD;
        const holdMs = when.ms ?? 0;
        if (value < threshold) {
          timing.heldSinceMs = null;
          return false;
        }
        if (timing.heldSinceMs === null) {
          timing.heldSinceMs = state.timestampMs;
        }
        return state.timestampMs - timing.heldSinceMs >= holdMs;
      }
      case 'trigger-full-pull':
        return value >= FULL_PULL_THRESHOLD;
      case 'button-held':
        return when.button !== undefined && state.buttons.has(when.button);
      case 'rapid-fire': {
        const required = when.pressesPerSecond ?? DEFAULT_PRESSES_PER_SECOND;
        return timing.pressTimestampsMs.length >= required;
      }
      default:
        return false;
    }
  }
}
```

Note: `heldSinceMs` tracking lives inside `conditionHolds`, which is fine because each trigger slot evaluates its own trigger's value; two `trigger-held-over` modifiers on the same trigger share hold state intentionally (same physical hold).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/trigger-modifier-eval.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/trigger-modifier-eval.ts src/shared/trigger-modifier-eval.test.ts
git commit -m "feat: add input-reactive trigger modifier evaluator"
```

---

### Task 3: Profile store (`main/trigger-profile-store.ts`)

**Files:**
- Create: `src/main/trigger-profile-store.ts`
- Test: `src/main/trigger-profile-store.test.ts`

**Interfaces:**
- Consumes: `TriggerProfile`, `validateTriggerProfile`, `createDefaultProfile`, `DEFAULT_PROFILE_ID` from Task 1.
- Produces (used by Tasks 6, 7):

```ts
export class TriggerProfileStore {
  constructor(directory: string);          // e.g. path.join(app.getPath('userData'), 'trigger-profiles')
  list(): TriggerProfile[];                // always includes the Default profile; sorted by name, Default first
  get(id: string): TriggerProfile | null;
  save(profile: TriggerProfile): TriggerProfile;  // validates, stamps updatedAtMs, writes <id>.json
  delete(id: string): boolean;             // refuses 'default' (returns false)
}
```

Store is synchronous (`node:fs` sync APIs), mirroring how `settings-store.ts` persists JSON. Invalid/corrupt profile files are skipped by `list()` with a `console.warn`, never thrown.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/trigger-profile-store.test.ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriggerProfileStore } from './trigger-profile-store';
import { createDefaultProfile, type TriggerProfile } from '../shared/trigger-profiles';

let dir: string;
let store: TriggerProfileStore;

const profile: TriggerProfile = {
  version: 1,
  id: 'generic-shooter',
  name: 'Generic Shooter',
  match: { processNames: ['game.exe'], windowTitles: [] },
  triggers: {
    l2: { base: null, modifiers: [] },
    r2: { base: { mode: 'weapon', startPercent: 10, wallPercent: 40, forcePercent: 90 }, modifiers: [] }
  },
  updatedAtMs: 0
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'trigger-profiles-'));
  store = new TriggerProfileStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('TriggerProfileStore', () => {
  it('lists the built-in default profile when the directory is empty', () => {
    const profiles = store.list();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe('default');
  });

  it('saves and reloads a profile', () => {
    const saved = store.save(profile);
    expect(saved.updatedAtMs).toBeGreaterThan(0);
    const reloaded = new TriggerProfileStore(dir).get('generic-shooter');
    expect(reloaded?.name).toBe('Generic Shooter');
  });

  it('rejects invalid profiles on save', () => {
    expect(() => store.save({ ...profile, version: 9 } as unknown as TriggerProfile)).toThrow();
  });

  it('skips corrupt files in list', () => {
    writeFileSync(path.join(dir, 'broken.json'), '{not json');
    store.save(profile);
    const ids = store.list().map((entry) => entry.id);
    expect(ids).toEqual(['default', 'generic-shooter']);
  });

  it('refuses to delete the default profile', () => {
    expect(store.delete('default')).toBe(false);
    expect(store.list()[0].id).toBe('default');
  });

  it('deletes a saved profile', () => {
    store.save(profile);
    expect(store.delete('generic-shooter')).toBe(true);
    expect(store.get('generic-shooter')).toBeNull();
  });

  it('persists edits to the default profile', () => {
    const edited = { ...createDefaultProfile(), name: 'My Fallback' };
    store.save(edited);
    expect(new TriggerProfileStore(dir).get('default')?.name).toBe('My Fallback');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/trigger-profile-store.test.ts`
Expected: FAIL — cannot resolve `./trigger-profile-store`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/trigger-profile-store.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createDefaultProfile,
  DEFAULT_PROFILE_ID,
  validateTriggerProfile,
  type TriggerProfile
} from '../shared/trigger-profiles';

export class TriggerProfileStore {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }

  list(): TriggerProfile[] {
    const profiles = new Map<string, TriggerProfile>();
    profiles.set(DEFAULT_PROFILE_ID, createDefaultProfile());
    for (const entry of readdirSync(this.directory)) {
      if (!entry.endsWith('.json')) continue;
      const filePath = path.join(this.directory, entry);
      try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
        const result = validateTriggerProfile(parsed);
        if (result.ok) {
          profiles.set(result.profile.id, result.profile);
        } else {
          console.warn(`Skipping invalid trigger profile ${entry}: ${result.error}`);
        }
      } catch (error) {
        console.warn(`Skipping unreadable trigger profile ${entry}:`, error);
      }
    }
    return [...profiles.values()].sort((a, b) => {
      if (a.id === DEFAULT_PROFILE_ID) return -1;
      if (b.id === DEFAULT_PROFILE_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  get(id: string): TriggerProfile | null {
    return this.list().find((profile) => profile.id === id) ?? null;
  }

  save(profile: TriggerProfile): TriggerProfile {
    const stamped = { ...profile, updatedAtMs: Date.now() };
    const result = validateTriggerProfile(stamped);
    if (!result.ok) {
      throw new Error(`Invalid trigger profile: ${result.error}`);
    }
    writeFileSync(this.profilePath(stamped.id), `${JSON.stringify(result.profile, null, 2)}\n`, 'utf8');
    return result.profile;
  }

  delete(id: string): boolean {
    if (id === DEFAULT_PROFILE_ID) return false;
    const filePath = this.profilePath(id);
    if (!existsSync(filePath)) return false;
    rmSync(filePath);
    return true;
  }

  private profilePath(id: string): string {
    return path.join(this.directory, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/trigger-profile-store.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/main/trigger-profile-store.ts src/main/trigger-profile-store.test.ts
git commit -m "feat: add trigger profile JSON store with built-in default"
```

---

### Task 4: Game watcher (`main/game-watcher.ts`)

**Files:**
- Create: `src/main/game-watcher.ts`
- Test: `src/main/game-watcher.test.ts`

**Interfaces:**
- Consumes: `TriggerProfile`, `DEFAULT_PROFILE_ID` from Task 1.
- Produces (used by Tasks 6, 7):

```ts
export type ProcessLister = () => string[];   // lowercase process identities (comm + argv0 basenames)
export interface ActiveProfileChange {
  profileId: string;
  matchedBy: 'pin' | 'process' | 'default';
  matchedName: string | null;                 // process name that matched, null for pin/default
}
export class GameWatcher extends EventEmitter {
  constructor(options: { listProcesses?: ProcessLister; pollIntervalMs?: number; debounceMs?: number });
  setProfiles(profiles: TriggerProfile[]): void;
  pinProfile(profileId: string | null): void;     // null clears the pin
  getActive(): ActiveProfileChange;
  start(): void;
  stop(): void;
  // emits 'change' with ActiveProfileChange when the active profile changes
}
```

The default `ProcessLister` scans `/proc/*/`: for each numeric pid it reads `comm` and the basename of the first `cmdline` argument (covers Wine/Proton `Game.exe` paths), lowercased. Window-title matching is deferred: `match.windowTitles` is stored but unused by the watcher in M1 (best-effort X11 lookup is a fast-follow; the field is already in the schema). Matching compares each profile's `match.processNames` (lowercased) for exact equality against the process list. Priority: pin > process match (ties broken by most recent `updatedAtMs`) > default. Changes are debounced: a new match must persist for `debounceMs` (default 5000) consecutive polls before `change` fires; pins apply immediately.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/game-watcher.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameWatcher } from './game-watcher';
import type { TriggerProfile } from '../shared/trigger-profiles';

function profile(id: string, processNames: string[], updatedAtMs = 0): TriggerProfile {
  return {
    version: 1,
    id,
    name: id,
    match: { processNames, windowTitles: [] },
    triggers: { l2: { base: null, modifiers: [] }, r2: { base: null, modifiers: [] } },
    updatedAtMs
  };
}

describe('GameWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function makeWatcher(processes: () => string[]) {
    const watcher = new GameWatcher({ listProcesses: processes, pollIntervalMs: 1000, debounceMs: 5000 });
    watcher.setProfiles([profile('shooter', ['game.exe']), profile('racer', ['racer'])]);
    return watcher;
  }

  it('starts on the default profile', () => {
    const watcher = makeWatcher(() => []);
    expect(watcher.getActive()).toEqual({ profileId: 'default', matchedBy: 'default', matchedName: null });
  });

  it('activates a matching profile only after the debounce window', () => {
    const watcher = makeWatcher(() => ['game.exe']);
    const changes: string[] = [];
    watcher.on('change', (change) => changes.push(change.profileId));
    watcher.start();
    vi.advanceTimersByTime(4000);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual(['shooter']);
    expect(watcher.getActive().matchedName).toBe('game.exe');
    watcher.stop();
  });

  it('reverts to default (debounced) when the game exits', () => {
    let running = ['game.exe'];
    const watcher = makeWatcher(() => running);
    watcher.start();
    vi.advanceTimersByTime(6000);
    expect(watcher.getActive().profileId).toBe('shooter');
    running = [];
    vi.advanceTimersByTime(4000);
    expect(watcher.getActive().profileId).toBe('shooter');
    vi.advanceTimersByTime(2000);
    expect(watcher.getActive().profileId).toBe('default');
    watcher.stop();
  });

  it('pin overrides process matching immediately and clears back', () => {
    const watcher = makeWatcher(() => ['game.exe']);
    watcher.start();
    vi.advanceTimersByTime(6000);
    watcher.pinProfile('racer');
    expect(watcher.getActive()).toEqual({ profileId: 'racer', matchedBy: 'pin', matchedName: null });
    watcher.pinProfile(null);
    vi.advanceTimersByTime(6000);
    expect(watcher.getActive().profileId).toBe('shooter');
    watcher.stop();
  });

  it('breaks same-tier match ties by most recently updated profile', () => {
    const watcher = new GameWatcher({ listProcesses: () => ['game.exe'], pollIntervalMs: 1000, debounceMs: 0 });
    watcher.setProfiles([profile('older', ['game.exe'], 100), profile('newer', ['game.exe'], 200)]);
    watcher.start();
    vi.advanceTimersByTime(1000);
    expect(watcher.getActive().profileId).toBe('newer');
    watcher.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/game-watcher.test.ts`
Expected: FAIL — cannot resolve `./game-watcher`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/game-watcher.ts
import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PROFILE_ID, type TriggerProfile } from '../shared/trigger-profiles';

export type ProcessLister = () => string[];

export interface ActiveProfileChange {
  profileId: string;
  matchedBy: 'pin' | 'process' | 'default';
  matchedName: string | null;
}

type GameWatcherOptions = {
  listProcesses?: ProcessLister;
  pollIntervalMs?: number;
  debounceMs?: number;
};

export function listProcProcesses(): string[] {
  const names = new Set<string>();
  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const comm = readFileSync(`/proc/${entry}/comm`, 'utf8').trim().toLowerCase();
      if (comm) names.add(comm);
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf8');
      const argv0 = cmdline.split('\0')[0];
      if (argv0) names.add(path.basename(argv0.replace(/\\/g, '/')).toLowerCase());
    } catch {
      // process exited mid-scan; ignore
    }
  }
  return [...names];
}

export class GameWatcher extends EventEmitter {
  private readonly listProcesses: ProcessLister;
  private readonly pollIntervalMs: number;
  private readonly debounceMs: number;
  private profiles: TriggerProfile[] = [];
  private pinnedProfileId: string | null = null;
  private active: ActiveProfileChange = { profileId: DEFAULT_PROFILE_ID, matchedBy: 'default', matchedName: null };
  private candidate: ActiveProfileChange | null = null;
  private candidateSinceMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameWatcherOptions = {}) {
    super();
    this.listProcesses = options.listProcesses ?? listProcProcesses;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.debounceMs = options.debounceMs ?? 5000;
  }

  setProfiles(profiles: TriggerProfile[]): void {
    this.profiles = profiles;
  }

  pinProfile(profileId: string | null): void {
    this.pinnedProfileId = profileId;
    this.candidate = null;
    if (profileId !== null) {
      this.activate({ profileId, matchedBy: 'pin', matchedName: null });
    } else {
      this.poll(true);
    }
  }

  getActive(): ActiveProfileChange {
    return this.active;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(false), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(immediate: boolean): void {
    if (this.pinnedProfileId !== null) return;
    const matched = this.matchProcesses();
    if (matched.profileId === this.active.profileId) {
      this.candidate = null;
      return;
    }
    const now = Date.now();
    if (immediate || this.debounceMs === 0) {
      this.activate(matched);
      return;
    }
    if (!this.candidate || this.candidate.profileId !== matched.profileId) {
      this.candidate = matched;
      this.candidateSinceMs = now;
      return;
    }
    if (now - this.candidateSinceMs >= this.debounceMs) {
      this.activate(matched);
    }
  }

  private matchProcesses(): ActiveProfileChange {
    const running = new Set(this.listProcesses());
    let best: { profile: TriggerProfile; name: string } | null = null;
    for (const profile of this.profiles) {
      if (profile.id === DEFAULT_PROFILE_ID) continue;
      for (const name of profile.match.processNames) {
        if (running.has(name.toLowerCase())) {
          if (!best || profile.updatedAtMs > best.profile.updatedAtMs) {
            best = { profile, name: name.toLowerCase() };
          }
          break;
        }
      }
    }
    if (best) {
      return { profileId: best.profile.id, matchedBy: 'process', matchedName: best.name };
    }
    return { profileId: DEFAULT_PROFILE_ID, matchedBy: 'default', matchedName: null };
  }

  private activate(next: ActiveProfileChange): void {
    this.candidate = null;
    if (next.profileId === this.active.profileId && next.matchedBy === this.active.matchedBy) {
      this.active = next;
      return;
    }
    this.active = next;
    this.emit('change', next);
  }
}
```

Debounce note: the fake-timer tests advance `vi.advanceTimersByTime`, which also mocks `Date.now()` under `vi.useFakeTimers()`, so the `now - candidateSinceMs` comparison works with fake time.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/game-watcher.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/main/game-watcher.ts src/main/game-watcher.test.ts
git commit -m "feat: add game watcher with /proc matching, pin, and debounce"
```

---

### Task 5: Evdev input reader (`main/evdev-input-reader.ts`)

**Files:**
- Create: `src/main/evdev-input-reader.ts`
- Test: `src/main/evdev-input-reader.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Task 6): an `EventEmitter` that emits `'input'` with `ControllerInputState` (shape from Task 2 — construct it structurally, importing the type from `../shared/trigger-modifier-eval`).

```ts
export function findDualSenseEventNode(): string | null;  // scans /sys/class/input/event*/device/name for 'DualSense'
export class EvdevInputReader extends EventEmitter {
  constructor(options?: { devicePath?: string; openStream?: (path: string) => NodeJS.ReadableStream });
  start(): void;    // opens stream, parses input_event structs, emits 'input' on EV_SYN
  stop(): void;
  // emits 'input' (ControllerInputState), 'error' (Error)
}
```

Parsing: Linux `struct input_event` on 64-bit is 24 bytes — `tv_sec` (int64 LE), `tv_usec` (int64 LE), `type` (uint16 LE), `code` (uint16 LE), `value` (int32 LE). Relevant events: `EV_ABS` (3) with `ABS_Z` (2) = L2 raw 0-255, `ABS_RZ` (5) = R2 raw 0-255; `EV_KEY` (1) for buttons — `BTN_SOUTH` (0x130) 'cross', `BTN_EAST` (0x131) 'circle', `BTN_NORTH` (0x133) 'triangle', `BTN_WEST` (0x134) 'square', `BTN_TL` (0x136) 'l1', `BTN_TR` (0x137) 'r1', `BTN_THUMBL` (0x13d) 'l3', `BTN_THUMBR` (0x13e) 'r3'. Accumulate state, emit one `'input'` per `EV_SYN` (0) packet using `Date.now()` as `timestampMs`. Buffer partial reads across chunks.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/evdev-input-reader.test.ts
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { EvdevInputReader } from './evdev-input-reader';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';

function event(type: number, code: number, value: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt16LE(type, 16);
  buffer.writeUInt16LE(code, 18);
  buffer.writeInt32LE(value, 20);
  return buffer;
}

const EV_SYN = 0;
const EV_KEY = 1;
const EV_ABS = 3;
const ABS_RZ = 5;
const BTN_TL = 0x136;

async function collect(reader: EvdevInputReader, count: number): Promise<ControllerInputState[]> {
  const states: ControllerInputState[] = [];
  return new Promise((resolve) => {
    reader.on('input', (state: ControllerInputState) => {
      states.push(state);
      if (states.length >= count) resolve(states);
    });
  });
}

describe('EvdevInputReader', () => {
  it('accumulates axis and button events and emits state on EV_SYN', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 1);
    stream.write(Buffer.concat([
      event(EV_ABS, ABS_RZ, 200),
      event(EV_KEY, BTN_TL, 1),
      event(EV_SYN, 0, 0)
    ]));
    const [state] = await pending;
    expect(state.r2).toBe(200);
    expect(state.l2).toBe(0);
    expect(state.buttons.has('l1')).toBe(true);
  });

  it('handles packets split across chunk boundaries', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 1);
    const packet = Buffer.concat([event(EV_ABS, ABS_RZ, 55), event(EV_SYN, 0, 0)]);
    stream.write(packet.subarray(0, 30));
    stream.write(packet.subarray(30));
    const [state] = await pending;
    expect(state.r2).toBe(55);
  });

  it('clears buttons on release', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 2);
    stream.write(Buffer.concat([event(EV_KEY, BTN_TL, 1), event(EV_SYN, 0, 0)]));
    stream.write(Buffer.concat([event(EV_KEY, BTN_TL, 0), event(EV_SYN, 0, 0)]));
    const [first, second] = await pending;
    expect(first.buttons.has('l1')).toBe(true);
    expect(second.buttons.has('l1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/evdev-input-reader.test.ts`
Expected: FAIL — cannot resolve `./evdev-input-reader`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/evdev-input-reader.ts
import { EventEmitter } from 'node:events';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';

const EVENT_SIZE = 24;
const EV_SYN = 0;
const EV_KEY = 1;
const EV_ABS = 3;
const ABS_Z = 2;
const ABS_RZ = 5;

const BUTTON_NAMES: Record<number, string> = {
  0x130: 'cross',
  0x131: 'circle',
  0x133: 'triangle',
  0x134: 'square',
  0x136: 'l1',
  0x137: 'r1',
  0x13d: 'l3',
  0x13e: 'r3'
};

export function findDualSenseEventNode(): string | null {
  let entries: string[];
  try {
    entries = readdirSync('/sys/class/input');
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.startsWith('event')) continue;
    try {
      const name = readFileSync(`/sys/class/input/${entry}/device/name`, 'utf8').trim();
      if (name.toLowerCase().includes('dualsense')) {
        return `/dev/input/${entry}`;
      }
    } catch {
      // ignore unreadable nodes
    }
  }
  return null;
}

type ReaderOptions = {
  devicePath?: string;
  openStream?: (path: string) => NodeJS.ReadableStream;
};

export class EvdevInputReader extends EventEmitter {
  private readonly devicePath: string | null;
  private readonly openStream: (path: string) => NodeJS.ReadableStream;
  private stream: NodeJS.ReadableStream | null = null;
  private pending = Buffer.alloc(0);
  private l2 = 0;
  private r2 = 0;
  private buttons = new Set<string>();

  constructor(options: ReaderOptions = {}) {
    super();
    this.devicePath = options.devicePath ?? findDualSenseEventNode();
    this.openStream = options.openStream ?? ((path) => createReadStream(path));
  }

  start(): void {
    if (this.stream) return;
    if (!this.devicePath) {
      this.emit('error', new Error('No DualSense evdev node found.'));
      return;
    }
    const stream = this.openStream(this.devicePath);
    this.stream = stream;
    stream.on('data', (chunk: Buffer) => this.consume(chunk));
    stream.on('error', (error: Error) => this.emit('error', error));
  }

  stop(): void {
    if (this.stream && 'destroy' in this.stream) {
      (this.stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
    }
    this.stream = null;
    this.pending = Buffer.alloc(0);
  }

  private consume(chunk: Buffer): void {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    while (this.pending.length >= EVENT_SIZE) {
      const record = this.pending.subarray(0, EVENT_SIZE);
      this.pending = this.pending.subarray(EVENT_SIZE);
      this.handleEvent(record.readUInt16LE(16), record.readUInt16LE(18), record.readInt32LE(20));
    }
  }

  private handleEvent(type: number, code: number, value: number): void {
    if (type === EV_ABS) {
      if (code === ABS_Z) this.l2 = value;
      if (code === ABS_RZ) this.r2 = value;
      return;
    }
    if (type === EV_KEY) {
      const name = BUTTON_NAMES[code];
      if (!name) return;
      if (value !== 0) this.buttons.add(name);
      else this.buttons.delete(name);
      return;
    }
    if (type === EV_SYN) {
      const state: ControllerInputState = {
        timestampMs: Date.now(),
        l2: this.l2,
        r2: this.r2,
        buttons: new Set(this.buttons)
      };
      this.emit('input', state);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/evdev-input-reader.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/main/evdev-input-reader.ts src/main/evdev-input-reader.test.ts
git commit -m "feat: add pure-Node evdev input reader for the virtual DualSense"
```

---

### Task 6: Trigger profile engine (`main/trigger-profile-engine.ts`)

**Files:**
- Create: `src/main/trigger-profile-engine.ts`
- Test: `src/main/trigger-profile-engine.test.ts`

**Interfaces:**
- Consumes: `TriggerProfileStore` (Task 3), `GameWatcher`/`ActiveProfileChange` (Task 4), `EvdevInputReader` (Task 5), `ModifierEvaluator`/`ControllerInputState` (Task 2), `AdaptiveTriggerPreviewEffect` from `src/shared/protocol.ts`.
- Produces (used by Task 7):

```ts
export interface TriggerEffectSink {   // subset of BridgeService — structurally satisfied by it
  applyAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<unknown>;
  resetAdaptiveTriggers(): Promise<unknown>;
}
export interface EngineStatus {
  enabled: boolean;
  suspended: boolean;
  activeProfileId: string;
  matchedBy: 'pin' | 'process' | 'default';
  matchedName: string | null;
}
export class TriggerProfileEngine extends EventEmitter {
  constructor(options: { sink: TriggerEffectSink; store: TriggerProfileStore; watcher: GameWatcher; reader: EvdevInputReader });
  setEnabled(enabled: boolean): Promise<void>;   // master switch; disabling resets triggers
  suspend(): Promise<void>;                      // Trigger Lab active; resets triggers
  resume(): Promise<void>;                       // re-applies active profile bases
  pinProfile(profileId: string | null): void;    // delegates to watcher
  refreshProfiles(): void;                       // reload store into watcher + re-resolve
  getStatus(): EngineStatus;
  // emits 'status' (EngineStatus) whenever it changes
}
```

Behavior:
- On watcher `'change'`: load the profile from the store, feed it to a `ModifierEvaluator`, apply each non-null `base` via the sink (`target: 'l2'` / `'r2'`); if both bases are null, `resetAdaptiveTriggers()`.
- On reader `'input'` (only while enabled, not suspended, and the active profile has modifiers): run the evaluator; for each trigger, if the resolved effect differs (deep-equal) from the last applied effect for that trigger, apply it; if resolved is null and the last applied wasn't, apply reset-for-that-trigger by re-sending base or, when both resolve null, one `resetAdaptiveTriggers()`.
- Dedupe means: never call the sink when nothing changed.
- Effect writes are serialized: keep a promise chain so a slow sink never sees interleaved writes; input states arriving while a write is in flight only update "latest desired" and are coalesced.
- `suspend()` / disable / profile-deactivation all call `resetAdaptiveTriggers()` once.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/trigger-profile-engine.test.ts
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriggerProfileEngine } from './trigger-profile-engine';
import { TriggerProfileStore } from './trigger-profile-store';
import { GameWatcher } from './game-watcher';
import type { AdaptiveTriggerPreviewEffect } from '../shared/protocol';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';
import type { TriggerProfile } from '../shared/trigger-profiles';

class FakeSink {
  applied: AdaptiveTriggerPreviewEffect[] = [];
  resets = 0;
  async applyAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<void> {
    this.applied.push(effect);
  }
  async resetAdaptiveTriggers(): Promise<void> {
    this.resets += 1;
  }
}

class FakeReader extends EventEmitter {
  start(): void {}
  stop(): void {}
  feed(state: Partial<ControllerInputState>): void {
    this.emit('input', { timestampMs: 0, l2: 0, r2: 0, buttons: new Set(), ...state });
  }
}

const profile: TriggerProfile = {
  version: 1,
  id: 'shooter',
  name: 'Shooter',
  match: { processNames: ['game.exe'], windowTitles: [] },
  triggers: {
    l2: { base: null, modifiers: [] },
    r2: {
      base: { mode: 'weapon', startPercent: 10, wallPercent: 40, forcePercent: 90 },
      modifiers: [{
        when: { source: 'input', condition: 'trigger-full-pull' },
        effect: { mode: 'vibration', startPercent: 0, wallPercent: 0, forcePercent: 60 }
      }]
    }
  },
  updatedAtMs: 0
};

let dir: string;
let sink: FakeSink;
let reader: FakeReader;
let watcher: GameWatcher;
let engine: TriggerProfileEngine;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'trigger-engine-'));
  const store = new TriggerProfileStore(dir);
  store.save(profile);
  sink = new FakeSink();
  reader = new FakeReader();
  watcher = new GameWatcher({ listProcesses: () => [], pollIntervalMs: 100000, debounceMs: 0 });
  engine = new TriggerProfileEngine({
    sink,
    store,
    watcher,
    reader: reader as never
  });
  engine.refreshProfiles();
  await engine.setEnabled(true);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TriggerProfileEngine', () => {
  it('applies base effects when a profile activates', async () => {
    watcher.pinProfile('shooter');
    await flush();
    expect(sink.applied).toHaveLength(1);
    expect(sink.applied[0]).toMatchObject({ mode: 'weapon', target: 'r2', forcePercent: 90 });
  });

  it('applies modifier effect on matching input and dedupes repeats', async () => {
    watcher.pinProfile('shooter');
    await flush();
    reader.feed({ r2: 255 });
    await flush();
    reader.feed({ r2: 255 });
    await flush();
    const vibration = sink.applied.filter((effect) => effect.mode === 'vibration');
    expect(vibration).toHaveLength(1);
    reader.feed({ r2: 0 });
    await flush();
    expect(sink.applied.at(-1)).toMatchObject({ mode: 'weapon', target: 'r2' });
  });

  it('resets triggers when the profile deactivates to an effectless default', async () => {
    watcher.pinProfile('shooter');
    await flush();
    watcher.pinProfile(null);
    await flush();
    expect(sink.resets).toBeGreaterThanOrEqual(1);
    expect(engine.getStatus().activeProfileId).toBe('default');
  });

  it('suspend resets and resume re-applies', async () => {
    watcher.pinProfile('shooter');
    await flush();
    const appliedBefore = sink.applied.length;
    await engine.suspend();
    expect(sink.resets).toBe(1);
    reader.feed({ r2: 255 });
    await flush();
    expect(sink.applied).toHaveLength(appliedBefore);
    await engine.resume();
    expect(sink.applied.length).toBeGreaterThan(appliedBefore);
  });

  it('disabling the engine resets and ignores everything', async () => {
    watcher.pinProfile('shooter');
    await flush();
    await engine.setEnabled(false);
    expect(sink.resets).toBe(1);
    reader.feed({ r2: 255 });
    await flush();
    expect(sink.applied.filter((effect) => effect.mode === 'vibration')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/trigger-profile-engine.test.ts`
Expected: FAIL — cannot resolve `./trigger-profile-engine`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/trigger-profile-engine.ts
import { EventEmitter } from 'node:events';
import type { AdaptiveTriggerPreviewEffect } from '../shared/protocol';
import { ModifierEvaluator, type ControllerInputState } from '../shared/trigger-modifier-eval';
import { DEFAULT_PROFILE_ID, type TriggerEffectSpec, type TriggerProfile } from '../shared/trigger-profiles';
import type { ActiveProfileChange, GameWatcher } from './game-watcher';
import type { EvdevInputReader } from './evdev-input-reader';
import type { TriggerProfileStore } from './trigger-profile-store';

export interface TriggerEffectSink {
  applyAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<unknown>;
  resetAdaptiveTriggers(): Promise<unknown>;
}

export interface EngineStatus {
  enabled: boolean;
  suspended: boolean;
  activeProfileId: string;
  matchedBy: 'pin' | 'process' | 'default';
  matchedName: string | null;
}

type EngineOptions = {
  sink: TriggerEffectSink;
  store: TriggerProfileStore;
  watcher: GameWatcher;
  reader: EvdevInputReader;
};

type TriggerName = 'l2' | 'r2';

function effectEquals(a: TriggerEffectSpec | null, b: TriggerEffectSpec | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.mode === b.mode &&
    a.startPercent === b.startPercent &&
    a.wallPercent === b.wallPercent &&
    a.forcePercent === b.forcePercent
  );
}

export class TriggerProfileEngine extends EventEmitter {
  private readonly sink: TriggerEffectSink;
  private readonly store: TriggerProfileStore;
  private readonly watcher: GameWatcher;
  private readonly reader: EvdevInputReader;
  private readonly evaluator = new ModifierEvaluator();
  private enabled = false;
  private suspended = false;
  private activeProfile: TriggerProfile | null = null;
  private lastApplied: Record<TriggerName, TriggerEffectSpec | null> = { l2: null, r2: null };
  private writeChain: Promise<void> = Promise.resolve();
  private latestDesired: { l2: TriggerEffectSpec | null; r2: TriggerEffectSpec | null } | null = null;
  private writeScheduled = false;

  constructor(options: EngineOptions) {
    super();
    this.sink = options.sink;
    this.store = options.store;
    this.watcher = options.watcher;
    this.reader = options.reader;
    this.watcher.on('change', (change: ActiveProfileChange) => {
      void this.onActiveProfileChange(change);
    });
    this.reader.on('input', (state: ControllerInputState) => this.onInput(state));
    this.reader.on('error', () => {
      // No evdev access: static bases still work; modifiers are inert.
    });
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.watcher.start();
      this.reader.start();
      await this.onActiveProfileChange(this.watcher.getActive());
    } else {
      this.watcher.stop();
      this.reader.stop();
      this.activeProfile = null;
      this.evaluator.setProfile(null);
      await this.resetIfNeeded(true);
    }
    this.emitStatus();
  }

  async suspend(): Promise<void> {
    if (this.suspended) return;
    this.suspended = true;
    await this.resetIfNeeded(true);
    this.emitStatus();
  }

  async resume(): Promise<void> {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.enabled) {
      await this.applyBases();
    }
    this.emitStatus();
  }

  pinProfile(profileId: string | null): void {
    this.watcher.pinProfile(profileId);
  }

  refreshProfiles(): void {
    const profiles = this.store.list();
    this.watcher.setProfiles(profiles);
    const active = this.watcher.getActive();
    if (this.enabled && this.activeProfile) {
      void this.onActiveProfileChange(active);
    }
  }

  getStatus(): EngineStatus {
    const active = this.watcher.getActive();
    return {
      enabled: this.enabled,
      suspended: this.suspended,
      activeProfileId: active.profileId,
      matchedBy: active.matchedBy,
      matchedName: active.matchedName
    };
  }

  private async onActiveProfileChange(change: ActiveProfileChange): Promise<void> {
    if (!this.enabled) return;
    this.activeProfile = this.store.get(change.profileId);
    this.evaluator.setProfile(this.activeProfile);
    if (!this.suspended) {
      await this.applyBases();
    }
    this.emitStatus();
  }

  private async applyBases(): Promise<void> {
    const profile = this.activeProfile;
    const l2 = profile?.triggers.l2.base ?? null;
    const r2 = profile?.triggers.r2.base ?? null;
    await this.writeDesired({ l2, r2 });
  }

  private onInput(state: ControllerInputState): void {
    if (!this.enabled || this.suspended || !this.activeProfile) return;
    const hasModifiers =
      this.activeProfile.triggers.l2.modifiers.length > 0 ||
      this.activeProfile.triggers.r2.modifiers.length > 0;
    if (!hasModifiers) return;
    const resolved = this.evaluator.update(state);
    this.latestDesired = resolved;
    if (this.writeScheduled) return;
    this.writeScheduled = true;
    this.writeChain = this.writeChain.then(async () => {
      this.writeScheduled = false;
      const desired = this.latestDesired;
      this.latestDesired = null;
      if (desired && this.enabled && !this.suspended) {
        await this.writeDesired(desired);
      }
    });
  }

  private async writeDesired(desired: { l2: TriggerEffectSpec | null; r2: TriggerEffectSpec | null }): Promise<void> {
    if (desired.l2 === null && desired.r2 === null) {
      await this.resetIfNeeded(false);
      return;
    }
    for (const trigger of ['l2', 'r2'] as const) {
      const effect = desired[trigger];
      if (effectEquals(effect, this.lastApplied[trigger])) continue;
      if (effect === null) {
        // One trigger dropped to no-effect while the other still has one:
        // re-send a zero-force feedback effect to relax it.
        await this.sink.applyAdaptiveTriggerEffect({
          mode: 'feedback',
          target: trigger,
          startPercent: 0,
          wallPercent: 0,
          forcePercent: 0
        });
      } else {
        await this.sink.applyAdaptiveTriggerEffect({ ...effect, target: trigger });
      }
      this.lastApplied[trigger] = effect;
    }
  }

  private async resetIfNeeded(force: boolean): Promise<void> {
    const hadEffects = this.lastApplied.l2 !== null || this.lastApplied.r2 !== null;
    if (hadEffects || force) {
      await this.sink.resetAdaptiveTriggers();
    }
    this.lastApplied = { l2: null, r2: null };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
```

Test-fit note: the third test expects a reset on deactivation to the effectless default — that flows through `onActiveProfileChange` → `applyBases` → `writeDesired({l2:null,r2:null})` → `resetIfNeeded(false)` with `hadEffects` true. The `suspend` test expects exactly one reset because `resetIfNeeded(true)` fires once and clears `lastApplied`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/trigger-profile-engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/main/trigger-profile-engine.ts src/main/trigger-profile-engine.test.ts
git commit -m "feat: add trigger profile engine composing watcher, reader, and evaluator"
```

---

### Task 7: Wire engine into main process + IPC + preload

**Files:**
- Modify: `src/main/main.ts` (engine construction near the `BridgeService` setup; IPC handlers next to the existing `bridge:*` handlers around line 994)
- Modify: `src/preload.ts` (extend the `api` object)
- Modify: `src/main/ipc-contract.test.ts` (add the new channel names to the contract list — open the file and follow its existing pattern exactly)
- Test: `src/main/ipc-contract.test.ts`

**Interfaces:**
- Consumes: `TriggerProfileEngine`, `EngineStatus` (Task 6), `TriggerProfileStore` (Task 3), `GameWatcher` (Task 4), `EvdevInputReader` (Task 5), `TriggerProfile` (Task 1).
- Produces (used by Task 8): preload API surface:

```ts
listTriggerProfiles(): Promise<TriggerProfile[]>;
saveTriggerProfile(profile: TriggerProfile): Promise<TriggerProfile>;
deleteTriggerProfile(id: string): Promise<boolean>;
setTriggerProfilesEnabled(enabled: boolean): Promise<EngineStatus>;
pinTriggerProfile(id: string | null): Promise<EngineStatus>;
getTriggerProfileEngineStatus(): Promise<EngineStatus>;
onTriggerProfileEngineStatus(listener: (status: EngineStatus) => void): () => void;  // subscribe, returns unsubscribe
```

- [ ] **Step 1: Write the failing test**

Add the six new invoke channels to `src/main/ipc-contract.test.ts` following the file's existing pattern (it asserts that every channel used in `preload.ts` has a matching `ipcMain.handle` in `main.ts`). Read the file first; add entries:

```
'bridge:listTriggerProfiles',
'bridge:saveTriggerProfile',
'bridge:deleteTriggerProfile',
'bridge:setTriggerProfilesEnabled',
'bridge:pinTriggerProfile',
'bridge:getTriggerProfileEngineStatus'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/ipc-contract.test.ts`
Expected: FAIL — new channels missing from main/preload.

- [ ] **Step 3: Implement main-process wiring**

In `src/main/main.ts`, after the `BridgeService` instance (`service`) is created:

```ts
import path from 'node:path';
import { TriggerProfileStore } from './trigger-profile-store';
import { GameWatcher } from './game-watcher';
import { EvdevInputReader } from './evdev-input-reader';
import { TriggerProfileEngine, type EngineStatus } from './trigger-profile-engine';
import type { TriggerProfile } from '../shared/trigger-profiles';

const triggerProfileStore = new TriggerProfileStore(
  path.join(app.getPath('userData'), 'trigger-profiles')
);
const triggerProfileEngine = new TriggerProfileEngine({
  sink: service,
  store: triggerProfileStore,
  watcher: new GameWatcher({}),
  reader: new EvdevInputReader()
});
triggerProfileEngine.refreshProfiles();
triggerProfileEngine.on('status', (status: EngineStatus) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('bridge:triggerProfileEngineStatus', status);
  }
});
```

IPC handlers next to the existing `bridge:*` handlers:

```ts
ipcMain.handle('bridge:listTriggerProfiles', () => triggerProfileStore.list());
ipcMain.handle('bridge:saveTriggerProfile', (_event, profile: TriggerProfile) => {
  const saved = triggerProfileStore.save(profile);
  triggerProfileEngine.refreshProfiles();
  return saved;
});
ipcMain.handle('bridge:deleteTriggerProfile', (_event, id: string) => {
  const deleted = triggerProfileStore.delete(id);
  triggerProfileEngine.refreshProfiles();
  return deleted;
});
ipcMain.handle('bridge:setTriggerProfilesEnabled', async (_event, enabled: boolean) => {
  await triggerProfileEngine.setEnabled(enabled);
  return triggerProfileEngine.getStatus();
});
ipcMain.handle('bridge:pinTriggerProfile', (_event, id: string | null) => {
  triggerProfileEngine.pinProfile(id);
  return triggerProfileEngine.getStatus();
});
ipcMain.handle('bridge:getTriggerProfileEngineStatus', () => triggerProfileEngine.getStatus());
```

Suspend/resume around Trigger Lab: find the existing handlers for `bridge:previewAdaptiveTriggerEffect`, `bridge:applyAdaptiveTriggerEffect`, `bridge:testAdaptiveTriggers`, and `bridge:resetAdaptiveTriggers` in `main.ts` and wrap them:

```ts
// before invoking the service method in preview/apply/test handlers:
await triggerProfileEngine.suspend();
// in the reset handler, after service.resetAdaptiveTriggers():
await triggerProfileEngine.resume();
```

(Exact handler names may differ slightly — locate them by grepping `AdaptiveTrigger` in `main.ts` and preserve their existing signatures.)

- [ ] **Step 4: Implement preload wiring**

In `src/preload.ts`, extend the `api` object (imports at top):

```ts
import type { TriggerProfile } from './shared/trigger-profiles';
import type { EngineStatus } from './main/trigger-profile-engine';
```

Note: if importing a `main/` module type from preload violates the project's tsconfig boundaries, move `EngineStatus` into `src/shared/trigger-profiles.ts` and re-export it from the engine instead.

```ts
listTriggerProfiles: (): Promise<TriggerProfile[]> => ipcRenderer.invoke('bridge:listTriggerProfiles'),
saveTriggerProfile: (profile: TriggerProfile): Promise<TriggerProfile> => (
  ipcRenderer.invoke('bridge:saveTriggerProfile', profile)
),
deleteTriggerProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('bridge:deleteTriggerProfile', id),
setTriggerProfilesEnabled: (enabled: boolean): Promise<EngineStatus> => (
  ipcRenderer.invoke('bridge:setTriggerProfilesEnabled', enabled)
),
pinTriggerProfile: (id: string | null): Promise<EngineStatus> => (
  ipcRenderer.invoke('bridge:pinTriggerProfile', id)
),
getTriggerProfileEngineStatus: (): Promise<EngineStatus> => (
  ipcRenderer.invoke('bridge:getTriggerProfileEngineStatus')
),
onTriggerProfileEngineStatus: (listener: (status: EngineStatus) => void): (() => void) => {
  const wrapped = (_event: unknown, status: EngineStatus) => listener(status);
  ipcRenderer.on('bridge:triggerProfileEngineStatus', wrapped);
  return () => ipcRenderer.removeListener('bridge:triggerProfileEngineStatus', wrapped);
}
```

Also extend the renderer's global API type declaration (`src/renderer/global.d.ts`) with the same signatures, following the existing entries.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/main/ipc-contract.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts src/preload.ts src/main/ipc-contract.test.ts src/renderer/global.d.ts
git commit -m "feat: wire trigger profile engine into main process and IPC"
```

---

### Task 8: Renderer Trigger Profiles panel

**Files:**
- Modify: `src/renderer/App.tsx` (new panel component + nav entry, following the pattern of existing panels such as Trigger Lab)
- Modify: `src/renderer/styles.css` (reuse existing card/list classes; add only what's missing)
- Test: `src/renderer/app-behavior.test.ts`

**Interfaces:**
- Consumes: the preload API from Task 7 (`window.ds5Bridge.*` — confirm the exact global name in `src/renderer/global.d.ts`), `TriggerProfile` / `TriggerEffectSpec` / `TriggerModifier` types from Task 1.
- Produces: `TriggerProfilesPanel` React component rendered in the app's panel switcher.

Scope for M1 UI (keep it minimal — the effect params reuse the same slider components Trigger Lab uses):
- Master enable toggle ("Game Trigger Profiles").
- Status line: `Active: <name> (matched: <process> | pinned | default)` driven by `onTriggerProfileEngineStatus`.
- Profile list with select/create/duplicate/delete; pin dropdown ("Auto" + profile names).
- Editor for the selected profile: name, process names (comma-separated text input), per-trigger base effect (mode select + 3 percent sliders + "no effect" checkbox), modifier list (condition select with its parameter fields + effect controls), add/remove modifier.
- Save button calls `saveTriggerProfile`; deletes confirm via the app's existing confirm pattern.

- [ ] **Step 1: Write failing behavior tests**

Open `src/renderer/app-behavior.test.ts` and study how existing panels are tested (it tests exported pure helpers, not full renders). Add tests for two new exported helpers that the panel will use:

```ts
import { parseProcessNamesInput, formatEngineStatusLine } from './App';

describe('trigger profiles panel helpers', () => {
  it('parses comma-separated process names, trimming and dropping empties', () => {
    expect(parseProcessNamesInput(' Game.exe, other , ,')).toEqual(['game.exe', 'other']);
  });

  it('formats the engine status line', () => {
    expect(formatEngineStatusLine(
      { enabled: true, suspended: false, activeProfileId: 'shooter', matchedBy: 'process', matchedName: 'game.exe' },
      'Generic Shooter'
    )).toBe('Active: Generic Shooter (matched: game.exe)');
    expect(formatEngineStatusLine(
      { enabled: true, suspended: false, activeProfileId: 'shooter', matchedBy: 'pin', matchedName: null },
      'Generic Shooter'
    )).toBe('Active: Generic Shooter (pinned)');
    expect(formatEngineStatusLine(
      { enabled: true, suspended: true, activeProfileId: 'default', matchedBy: 'default', matchedName: null },
      'Default'
    )).toBe('Active: Default (suspended by Trigger Lab)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/app-behavior.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement helpers and panel**

Export from `App.tsx`:

```ts
export function parseProcessNamesInput(input: string): string[] {
  return input
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function formatEngineStatusLine(status: EngineStatus, activeProfileName: string): string {
  if (status.suspended) return `Active: ${activeProfileName} (suspended by Trigger Lab)`;
  if (status.matchedBy === 'pin') return `Active: ${activeProfileName} (pinned)`;
  if (status.matchedBy === 'process') return `Active: ${activeProfileName} (matched: ${status.matchedName})`;
  return `Active: ${activeProfileName} (default)`;
}
```

Then build `TriggerProfilesPanel` inside `App.tsx` following the structure of the existing Trigger Lab panel section: same card/section/slider/select component usage, `useState` for the profile list and selected profile draft, `useEffect` subscribing via `onTriggerProfileEngineStatus` (cleanup with the returned unsubscribe). State flow: load profiles on mount with `listTriggerProfiles()`; edits mutate a local draft; Save button persists and reloads the list. New-profile ids are slugified from the name (`name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`). Register the panel in the app's navigation the same way existing panels are registered (grep for the Trigger Lab nav entry and mirror it).

This step is UI assembly against existing components; the implementer should mirror the Trigger Lab panel's JSX structure rather than invent new patterns. No new CSS classes unless a layout gap appears — then extend `styles.css` minimally.

- [ ] **Step 4: Run tests, typecheck, and layout guard**

Run: `npx vitest run src/renderer && npm run typecheck`
Expected: PASS (including the pre-existing `styles-layout.test.ts` guards — if a guard fails, adjust the panel to fit the layout constraints it asserts).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/styles.css src/renderer/app-behavior.test.ts src/renderer/global.d.ts
git commit -m "feat: add Trigger Profiles panel with editor, pin, and live status"
```

---

### Task 9: End-to-end test with the mock transport + docs

**Files:**
- Create: `src/main/trigger-profiles-e2e.test.ts`
- Modify: `README.md` (short feature section)

**Interfaces:**
- Consumes: everything from Tasks 1-7. Uses `MockCompanionTransport` (`src/main/mock-companion-transport.ts`) exactly as `bridge-service.test.ts` constructs a `BridgeService` against it — read those tests first and reuse their setup helper verbatim.

- [ ] **Step 1: Write the e2e test**

```ts
// src/main/trigger-profiles-e2e.test.ts
// Setup: construct BridgeService over MockCompanionTransport the same way
// bridge-service.test.ts does (copy its service factory helper), then:
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriggerProfileEngine } from './trigger-profile-engine';
import { TriggerProfileStore } from './trigger-profile-store';
import { GameWatcher } from './game-watcher';

describe('trigger profiles end-to-end', () => {
  // beforeEach: build service+mock transport via the bridge-service.test.ts helper,
  // a store in a temp dir with one profile matching 'game.exe' (r2 weapon base +
  // full-pull vibration modifier), a GameWatcher with listProcesses stub, a fake
  // reader (EventEmitter with start/stop no-ops), and the engine over all of them.

  it('activates on process match and writes the base effect through the transport', async () => {
    // enable engine; make listProcesses return ['game.exe']; advance/trigger a poll;
    // assert the mock transport captured an APPLY_ADAPTIVE_TRIGGER_EFFECT command
    // (COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT) with weapon mode + r2 target bits.
  });

  it('writes the modifier effect on full pull and resets on game exit', async () => {
    // feed reader input r2=255, assert vibration apply command; then empty the
    // process list, trigger polls past the debounce, assert RESET_ADAPTIVE_TRIGGERS.
  });
});
```

The two test bodies must be fully implemented (the comments above describe intent, not placeholders to leave in). Assert on the raw command reports the mock transport records: `COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT` (0x20) with `value = triggerTestModeValue(mode) | (triggerTestTargetValue(target) << 8)` and `extraPayload [startPercent, wallPercent, forcePercent]`, and `COMMAND_ID.RESET_ADAPTIVE_TRIGGERS` (0x0E). Check how `MockCompanionTransport` records or acks commands (read `mock-companion-transport.ts`) — if it doesn't retain a command log, spy on `transport.sendFeatureReport` / `transport.write` with `vi.spyOn` and decode the report bytes.

- [ ] **Step 2: Run and make it pass**

Run: `npx vitest run src/main/trigger-profiles-e2e.test.ts`
Expected: PASS after any fixture fixes.

- [ ] **Step 3: Full suite + typecheck**

Run: `npm run test:companion && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Docs**

Add to the repo `README.md` (root, `~/Virtual-DS5-Bridge/README.md`) a short "Trigger Profiles" section: what it does (per-game adaptive trigger profiles for games without native DualSense support), where profiles live (`<userData>/trigger-profiles/*.json`), the evdev permission note (the reader needs read access to the virtual DualSense's `/dev/input/event*` node — typically the `input` group; static base effects still work without it, reactive modifiers do not), and that audio-reactive modifiers are a planned M2.

- [ ] **Step 5: Commit**

```bash
git add src/main/trigger-profiles-e2e.test.ts ../../README.md
git commit -m "test: add trigger profiles e2e over mock transport; document feature"
```
