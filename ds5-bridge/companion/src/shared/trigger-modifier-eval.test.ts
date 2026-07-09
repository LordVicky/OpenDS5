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
