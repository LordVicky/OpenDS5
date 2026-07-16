import { describe, expect, it } from 'vitest';
import {
  createDefaultProfile,
  defaultStateIndex,
  effectSpecEquals,
  profileStateList,
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

  it('accepts a valid meta block and preserves it', () => {
    const result = validateTriggerProfile({
      ...valid,
      meta: { game: 'Cyberpunk', author: 'me', description: 'nice', source: 'library' }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.meta).toEqual({
        game: 'Cyberpunk',
        author: 'me',
        description: 'nice',
        source: 'library'
      });
    }
  });

  it('leaves meta absent when not provided', () => {
    const result = validateTriggerProfile(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect('meta' in result.profile).toBe(false);
  });

  it('rejects unknown meta keys naming the offender', () => {
    const result = validateTriggerProfile({ ...valid, meta: { bogusMeta: 'x' } });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('bogusMeta') });
  });

  it('rejects non-string meta fields', () => {
    const result = validateTriggerProfile({ ...valid, meta: { game: 123 } });
    expect(result.ok).toBe(false);
  });

  it('rejects meta fields over 500 chars', () => {
    const result = validateTriggerProfile({ ...valid, meta: { description: 'x'.repeat(501) } });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid meta.source values', () => {
    const result = validateTriggerProfile({ ...valid, meta: { source: 'bogus' } });
    expect(result.ok).toBe(false);
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

describe('validateTriggerProfile states and switching', () => {
  const emptySlots = {
    l2: { base: null, modifiers: [] },
    r2: { base: null, modifiers: [] }
  };
  const twoStates = [
    { name: 'Pistol', triggers: valid.triggers },
    { name: 'Shotgun', triggers: emptySlots }
  ];

  it('accepts states with switching rules and preserves them', () => {
    const result = validateTriggerProfile({
      ...valid,
      states: twoStates,
      switching: {
        defaultState: 'Shotgun',
        rules: [
          { button: 'triangle', action: 'cycle' },
          { button: 'dpad-right', action: 'select', state: 'Shotgun' },
          { button: 'r1', while: 'ps', action: 'cycle' }
        ],
        menuButtons: ['options'],
        menuTimeoutMs: 30000
      }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.states).toHaveLength(2);
      expect(result.profile.states?.[0].name).toBe('Pistol');
      expect(result.profile.switching?.defaultState).toBe('Shotgun');
      expect(result.profile.switching?.rules[2].while).toBe('ps');
      expect(result.profile.switching?.menuButtons).toEqual(['options']);
    }
  });

  it('leaves states and switching absent when not provided', () => {
    const result = validateTriggerProfile(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('states' in result.profile).toBe(false);
      expect('switching' in result.profile).toBe(false);
    }
  });

  it('rejects switching without states', () => {
    const result = validateTriggerProfile({ ...valid, switching: { rules: [] } });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('states') });
  });

  it('rejects empty and oversized state lists', () => {
    expect(validateTriggerProfile({ ...valid, states: [] }).ok).toBe(false);
    const many = Array.from({ length: 13 }, (_, index) => ({ name: `S${index}`, triggers: emptySlots }));
    expect(validateTriggerProfile({ ...valid, states: many }).ok).toBe(false);
  });

  it('rejects duplicate, empty, and overlong state names', () => {
    const dup = [twoStates[0], { ...twoStates[1], name: 'Pistol' }];
    expect(validateTriggerProfile({ ...valid, states: dup }).ok).toBe(false);
    expect(validateTriggerProfile({ ...valid, states: [{ name: '', triggers: emptySlots }] }).ok).toBe(false);
    expect(validateTriggerProfile({ ...valid, states: [{ name: 'x'.repeat(33), triggers: emptySlots }] }).ok).toBe(false);
  });

  it('validates state trigger slots with the shared effect validator', () => {
    const result = validateTriggerProfile({
      ...valid,
      states: [{ name: 'Bad', triggers: { l2: { base: { mode: 'laser' }, modifiers: [] }, r2: emptySlots.r2 } }]
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('laser') });
  });

  it('rejects unknown fields in states, rules, and switching naming the offender', () => {
    expect(validateTriggerProfile({
      ...valid,
      states: [{ name: 'A', triggers: emptySlots, bogus: 1 }]
    })).toEqual({ ok: false, error: expect.stringContaining('bogus') });
    expect(validateTriggerProfile({
      ...valid,
      states: twoStates,
      switching: { rules: [{ button: 'triangle', action: 'cycle', extra: 1 }] }
    })).toEqual({ ok: false, error: expect.stringContaining('extra') });
    expect(validateTriggerProfile({
      ...valid,
      states: twoStates,
      switching: { rules: [], surprise: true }
    })).toEqual({ ok: false, error: expect.stringContaining('surprise') });
  });

  it('rejects rules with unknown buttons, bad actions, or bad state targets', () => {
    const withRules = (rules: unknown[]) => validateTriggerProfile({
      ...valid,
      states: twoStates,
      switching: { rules }
    });
    expect(withRules([{ button: 'megabutton', action: 'cycle' }]).ok).toBe(false);
    expect(withRules([{ button: 'triangle', action: 'teleport' }]).ok).toBe(false);
    expect(withRules([{ button: 'triangle', action: 'select', state: 'Nope' }]).ok).toBe(false);
    expect(withRules([{ button: 'triangle', action: 'select' }]).ok).toBe(false);
    expect(withRules([{ button: 'triangle', action: 'cycle', state: 'Pistol' }]).ok).toBe(false);
    expect(withRules([{ button: 'triangle', action: 'cycle', while: 'megabutton' }]).ok).toBe(false);
  });

  it('rejects a defaultState that names no state and bad menu settings', () => {
    const base = { ...valid, states: twoStates };
    expect(validateTriggerProfile({ ...base, switching: { defaultState: 'Nope', rules: [] } }).ok).toBe(false);
    expect(validateTriggerProfile({ ...base, switching: { rules: [], menuButtons: ['megabutton'] } }).ok).toBe(false);
    expect(validateTriggerProfile({ ...base, switching: { rules: [], menuTimeoutMs: -1 } }).ok).toBe(false);
    expect(validateTriggerProfile({ ...base, switching: { rules: [], menuTimeoutMs: 1.5 } }).ok).toBe(false);
  });

  it('caps the rule list', () => {
    const rules = Array.from({ length: 17 }, () => ({ button: 'triangle', action: 'cycle' }));
    expect(validateTriggerProfile({ ...valid, states: twoStates, switching: { rules } }).ok).toBe(false);
  });
});

describe('validateTriggerProfile stickWheel', () => {
  const states = [
    { name: 'Pistol', triggers: valid.triggers },
    { name: 'Shotgun', triggers: valid.triggers }
  ];
  const wheel = {
    button: 'triangle',
    thresholdPercent: 50,
    angleOffsetDeg: 0,
    sectors: ['Pistol', 'Shotgun']
  };
  function profileWith(stickWheel: unknown, switchingExtra: Record<string, unknown> = {}) {
    return { ...valid, states, switching: { rules: [], stickWheel, ...switchingExtra } };
  }

  it('accepts a valid stickWheel and preserves it', () => {
    const result = validateTriggerProfile(profileWith(wheel));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.switching?.stickWheel).toEqual(wheel);
  });

  it('accepts null sector entries', () => {
    const result = validateTriggerProfile(profileWith({ ...wheel, sectors: ['Pistol', null, 'Shotgun'] }));
    expect(result.ok).toBe(true);
  });

  it('rejects unknown stickWheel fields', () => {
    const result = validateTriggerProfile(profileWith({ ...wheel, bogus: 1 }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('bogus') });
  });

  it('rejects an unknown wheel button', () => {
    const result = validateTriggerProfile(profileWith({ ...wheel, button: 'flipper' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('button') });
  });

  it('rejects thresholdPercent outside 1-100 or non-integer', () => {
    for (const thresholdPercent of [0, 101, 50.5]) {
      const result = validateTriggerProfile(profileWith({ ...wheel, thresholdPercent }));
      expect(result).toEqual({ ok: false, error: expect.stringContaining('thresholdPercent') });
    }
  });

  it('rejects angleOffsetDeg outside 0-359 or non-integer', () => {
    for (const angleOffsetDeg of [-1, 360, 12.5]) {
      const result = validateTriggerProfile(profileWith({ ...wheel, angleOffsetDeg }));
      expect(result).toEqual({ ok: false, error: expect.stringContaining('angleOffsetDeg') });
    }
  });

  it('rejects sectors with fewer than 2 or more than 12 entries', () => {
    for (const sectors of [['Pistol'], Array.from({ length: 13 }, () => null)]) {
      const result = validateTriggerProfile(profileWith({ ...wheel, sectors }));
      expect(result).toEqual({ ok: false, error: expect.stringContaining('sectors') });
    }
  });

  it('rejects a sector naming a state that does not exist', () => {
    const result = validateTriggerProfile(profileWith({ ...wheel, sectors: ['Pistol', 'Bazooka'] }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('existing state') });
  });

  it('rejects a wheel button that is also a menu button', () => {
    const result = validateTriggerProfile(profileWith(wheel, { menuButtons: ['triangle'] }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('menuButtons') });
  });
});

describe('profileStateList and defaultStateIndex', () => {
  it('wraps a states-less profile as a single anonymous state', () => {
    const list = profileStateList(valid);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('');
    expect(list[0].triggers).toBe(valid.triggers);
  });

  it('returns declared states and resolves the default index', () => {
    const profile: TriggerProfile = {
      ...valid,
      states: [
        { name: 'A', triggers: valid.triggers },
        { name: 'B', triggers: valid.triggers }
      ],
      switching: { defaultState: 'B', rules: [] }
    };
    expect(profileStateList(profile)).toHaveLength(2);
    expect(defaultStateIndex(profile)).toBe(1);
    expect(defaultStateIndex({ ...profile, switching: { rules: [] } })).toBe(0);
    expect(defaultStateIndex(valid)).toBe(0);
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
