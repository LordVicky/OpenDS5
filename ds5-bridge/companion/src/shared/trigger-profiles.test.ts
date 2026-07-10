import { describe, expect, it } from 'vitest';
import {
  createDefaultProfile,
  effectSpecEquals,
  validateTriggerProfile,
  type TriggerProfile,
  type TriggerModifier
} from './trigger-profiles';

const valid: TriggerProfile = {
  version: 1,
  id: 'generic-shooter',
  name: 'Generic Shooter',
  match: { processNames: ['cyberpunk2077.exe'], windowTitles: [] },
  triggers: {
    l2: { base: { mode: 'feedback', startPercent: 20, forcePercent: 80 }, modifiers: [] },
    r2: {
      base: { mode: 'weapon', startPercent: 10, wallPercent: 40, forcePercent: 90 },
      modifiers: [{
        when: { source: 'input', condition: 'trigger-held-over', threshold: 128, ms: 300 },
        effect: { mode: 'vibration', startPercent: 0, forcePercent: 60 }
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
    (bad.triggers.l2.base as { forcePercent: number }).forcePercent = 150;
    expect(validateTriggerProfile(bad).ok).toBe(false);
  });

  it('accepts audio-source modifiers without validating their condition', () => {
    const withAudio = structuredClone(valid);
    const audioModifier: TriggerModifier = {
      when: { source: 'audio', condition: 'transient-kick' },
      effect: { mode: 'vibration', startPercent: 0, forcePercent: 100 }
    };
    withAudio.triggers.r2.modifiers.push(audioModifier);
    expect(validateTriggerProfile(withAudio).ok).toBe(true);
  });

  it('rejects unknown input condition types', () => {
    const bad = structuredClone(valid);
    bad.triggers.r2.modifiers[0].when.condition = 'moon-phase';
    expect(validateTriggerProfile(bad).ok).toBe(false);
  });
});

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
    const a = { mode: 'multi-feedback', zones: [0,1,2,3,4,5,6,7,8,9] } satisfies Parameters<typeof effectSpecEquals>[0];
    expect(effectSpecEquals(a, { ...a, zones: [...a.zones] })).toBe(true);
    expect(effectSpecEquals(a, { ...a, zones: [0,1,2,3,4,5,6,7,8,10] })).toBe(false);
    expect(effectSpecEquals(null, { mode: 'off' })).toBe(false);
    expect(effectSpecEquals(null, null)).toBe(true);
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
