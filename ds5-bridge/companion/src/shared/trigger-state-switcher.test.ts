import { describe, expect, it } from 'vitest';
import { StateSwitcher } from './trigger-state-switcher';
import type { ControllerInputState } from './trigger-modifier-eval';
import type { StateSwitching, TriggerProfile, TriggerSlotPair } from './trigger-profiles';

const emptySlots: TriggerSlotPair = {
  l2: { base: null, modifiers: [] },
  r2: { base: null, modifiers: [] }
};

function makeProfile(switching: StateSwitching, stateNames = ['Pistol', 'Shotgun', 'Sniper']): TriggerProfile {
  return {
    version: 1,
    id: 'test',
    name: 'Test',
    match: { processNames: [], windowTitles: [] },
    triggers: emptySlots,
    states: stateNames.map((name) => ({ name, triggers: emptySlots })),
    switching,
    updatedAtMs: 0
  };
}

function input(buttons: string[], timestampMs = 0, stick?: { lx: number; ly: number }): ControllerInputState {
  return { timestampMs, l2: 0, r2: 0, lx: stick?.lx ?? 128, ly: stick?.ly ?? 128, buttons: new Set(buttons) };
}

describe('StateSwitcher', () => {
  it('starts at the default state and reports its name', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({ defaultState: 'Shotgun', rules: [] }));
    expect(switcher.activeIndex).toBe(1);
    expect(switcher.activeStateName).toBe('Shotgun');
  });

  it('reports null state name and no rules for a states-less profile', () => {
    const switcher = new StateSwitcher();
    const profile = makeProfile({ rules: [] });
    delete profile.states;
    delete profile.switching;
    switcher.setProfile(profile);
    expect(switcher.activeStateName).toBeNull();
    expect(switcher.hasRules()).toBe(false);
    expect(switcher.update(input(['triangle'])).changed).toBe(false);
  });

  it('cycles on a press edge and wraps, but not while held', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({ rules: [{ button: 'triangle', action: 'cycle' }] }));
    expect(switcher.update(input(['triangle'])).index).toBe(1);
    expect(switcher.update(input(['triangle'])).changed).toBe(false);
    expect(switcher.update(input([])).changed).toBe(false);
    expect(switcher.update(input(['triangle'])).index).toBe(2);
    expect(switcher.update(input([])).changed).toBe(false);
    expect(switcher.update(input(['triangle'])).index).toBe(0);
  });

  it('selects a named state and re-anchors regardless of drift', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({
      rules: [
        { button: 'triangle', action: 'cycle' },
        { button: 'dpad-right', action: 'select', state: 'Sniper' }
      ]
    }));
    switcher.update(input(['triangle']));
    const result = switcher.update(input(['dpad-right']));
    expect(result).toMatchObject({ index: 2, changed: true });
    expect(switcher.update(input([]))).toMatchObject({ changed: false });
    expect(switcher.update(input(['dpad-right'])).changed).toBe(false);
  });

  it('honors while-chord rules only when the chord button is held', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({ rules: [{ button: 'r1', while: 'ps', action: 'cycle' }] }));
    expect(switcher.update(input(['r1'])).changed).toBe(false);
    expect(switcher.update(input([])).changed).toBe(false);
    expect(switcher.update(input(['ps', 'r1'])).index).toBe(1);
  });

  it('suspends rules while the menu guard is up and resumes on toggle', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({
      rules: [{ button: 'triangle', action: 'cycle' }],
      menuButtons: ['options']
    }));
    expect(switcher.update(input(['options'])).menuSuspended).toBe(true);
    expect(switcher.update(input([])).menuSuspended).toBe(true);
    expect(switcher.update(input(['triangle'])).changed).toBe(false);
    expect(switcher.update(input([])).menuSuspended).toBe(true);
    expect(switcher.update(input(['options'])).menuSuspended).toBe(false);
    expect(switcher.update(input([])).changed).toBe(false);
    expect(switcher.update(input(['triangle'])).index).toBe(1);
  });

  it('releases the menu guard after the timeout', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({
      rules: [{ button: 'triangle', action: 'cycle' }],
      menuButtons: ['options'],
      menuTimeoutMs: 1000
    }));
    expect(switcher.update(input(['options'], 0)).menuSuspended).toBe(true);
    expect(switcher.update(input([], 500)).menuSuspended).toBe(true);
    expect(switcher.update(input([], 1000)).menuSuspended).toBe(false);
    switcher.update(input([], 1001));
    expect(switcher.update(input(['triangle'], 1002)).index).toBe(1);
  });

  it('manual select bypasses the menu guard and unknown names are ignored', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({
      rules: [],
      menuButtons: ['options']
    }));
    switcher.update(input(['options']));
    expect(switcher.select('Sniper')).toMatchObject({ index: 2, changed: true });
    expect(switcher.select('Nope')).toMatchObject({ index: 2, changed: false });
  });

  it('resets to the default state on profile change', () => {
    const switcher = new StateSwitcher();
    const profile = makeProfile({ rules: [{ button: 'triangle', action: 'cycle' }] });
    switcher.setProfile(profile);
    switcher.update(input(['triangle']));
    expect(switcher.activeIndex).toBe(1);
    switcher.setProfile(profile);
    expect(switcher.activeIndex).toBe(0);
  });

  it('ignores buttons with no matching rule', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(makeProfile({ rules: [{ button: 'triangle', action: 'cycle' }] }));
    expect(switcher.update(input(['cross', 'square'])).changed).toBe(false);
  });
});

describe('StateSwitcher stick wheel', () => {
  // States Pistol/Shotgun/Sniper, three 120-degree sectors clockwise from 12
  // o'clock: sector 0 = Pistol (up/right side), 1 = Shotgun (down), 2 = Sniper (left).
  function wheelProfile(overrides: Record<string, unknown> = {}) {
    return makeProfile({
      rules: [],
      stickWheel: {
        button: 'triangle',
        thresholdPercent: 50,
        angleOffsetDeg: 0,
        sectors: ['Pistol', 'Shotgun', 'Sniper'],
        ...overrides
      }
    });
  }
  const UP = { lx: 128, ly: 0 };
  const DOWN = { lx: 128, ly: 255 };
  const LEFT = { lx: 0, ly: 128 };
  const CENTER = { lx: 128, ly: 128 };

  it('commits the pointed sector when the wheel button is released', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(wheelProfile());
    switcher.update(input(['triangle'], 0, CENTER));
    switcher.update(input(['triangle'], 1, DOWN));
    const result = switcher.update(input([], 2, CENTER));
    expect(result).toMatchObject({ changed: true });
    expect(switcher.activeStateName).toBe('Shotgun');
  });

  it('changes nothing when released without crossing the threshold', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(wheelProfile());
    switcher.update(input(['triangle'], 0, CENTER));
    switcher.update(input(['triangle'], 1, { lx: 140, ly: 120 }));
    const result = switcher.update(input([], 2, CENTER));
    expect(result.changed).toBe(false);
    expect(switcher.activeStateName).toBe('Pistol');
  });

  it('commits the last sector visited when the stick wanders', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(wheelProfile());
    switcher.update(input(['triangle'], 0, DOWN));
    switcher.update(input(['triangle'], 1, LEFT));
    switcher.update(input([], 2, CENTER));
    expect(switcher.activeStateName).toBe('Sniper');
  });

  it('keeps the last valid sector when the stick ends on a null sector', () => {
    const switcher = new StateSwitcher();
    switcher.setProfile(wheelProfile({ sectors: ['Pistol', 'Shotgun', null] }));
    switcher.update(input(['triangle'], 0, DOWN));
    switcher.update(input(['triangle'], 1, LEFT));
    switcher.update(input([], 2, CENTER));
    expect(switcher.activeStateName).toBe('Shotgun');
  });

  it('registers a sector at exactly the threshold magnitude', () => {
    const switcher = new StateSwitcher();
    // threshold 50% of 128 = 64: ly = 128 + 64 = 192 points straight down.
    switcher.setProfile(wheelProfile());
    switcher.update(input(['triangle'], 0, CENTER));
    switcher.update(input(['triangle'], 1, { lx: 128, ly: 192 }));
    switcher.update(input([], 2, CENTER));
    expect(switcher.activeStateName).toBe('Shotgun');
  });

  it('applies the angle offset when mapping sectors', () => {
    const switcher = new StateSwitcher();
    // Straight down is 180deg raw -> sector 1 ('Shotgun') without offset; with
    // offset 90 it becomes relative 90deg -> sector 0 ('Sniper').
    switcher.setProfile(wheelProfile({ angleOffsetDeg: 90, sectors: ['Sniper', 'Shotgun', 'Pistol'] }));
    switcher.update(input(['triangle'], 0, DOWN));
    switcher.update(input([], 1, CENTER));
    expect(switcher.activeStateName).toBe('Sniper');
  });

  it('maps the stick through unequal sector spans when sectorSpansDeg is set', () => {
    const switcher = new StateSwitcher();
    // Pistol owns the whole top/right half plus more (0-200deg), Shotgun
    // 200-300, Sniper 300-360: straight down (180deg) is now Pistol, and
    // left (270deg) is Shotgun instead of Sniper.
    switcher.setProfile(wheelProfile({ sectorSpansDeg: [200, 100, 60] }));
    switcher.update(input(['triangle'], 0, DOWN));
    switcher.update(input([], 1, CENTER));
    expect(switcher.activeStateName).toBe('Pistol');
    switcher.update(input(['triangle'], 2, LEFT));
    switcher.update(input([], 3, CENTER));
    expect(switcher.activeStateName).toBe('Shotgun');
  });

  it('does not fire ordinary rules bound to the wheel button', () => {
    const switcher = new StateSwitcher();
    const profile = wheelProfile();
    profile.switching!.rules = [{ button: 'triangle', action: 'cycle' }];
    switcher.setProfile(profile);
    switcher.update(input(['triangle'], 0, CENTER));
    const result = switcher.update(input([], 1, CENTER));
    expect(result.changed).toBe(false);
    expect(switcher.activeStateName).toBe('Pistol');
  });

  it('commits even while the menu guard is up', () => {
    const switcher = new StateSwitcher();
    const profile = wheelProfile();
    profile.switching!.menuButtons = ['options'];
    switcher.setProfile(profile);
    switcher.update(input(['options'], 0, CENTER));
    switcher.update(input(['triangle'], 1, DOWN));
    switcher.update(input([], 2, CENTER));
    expect(switcher.activeStateName).toBe('Shotgun');
  });

  it('abandons an in-flight gesture on profile change', () => {
    const switcher = new StateSwitcher();
    const profile = wheelProfile();
    switcher.setProfile(profile);
    switcher.update(input(['triangle'], 0, DOWN));
    switcher.setProfile(profile);
    const result = switcher.update(input([], 1, CENTER));
    expect(result.changed).toBe(false);
    expect(switcher.activeStateName).toBe('Pistol');
  });
});
