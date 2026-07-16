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

function input(buttons: string[], timestampMs = 0): ControllerInputState {
  return { timestampMs, l2: 0, r2: 0, buttons: new Set(buttons) };
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
