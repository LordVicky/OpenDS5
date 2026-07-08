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
