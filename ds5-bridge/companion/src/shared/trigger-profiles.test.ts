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
