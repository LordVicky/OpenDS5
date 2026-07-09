import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameWatcher, listCandidateGameProcesses, type RawProcessInfo } from './game-watcher';
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

  it('pinning the already-active process-matched profile updates matchedBy without emitting change', () => {
    const watcher = makeWatcher(() => ['game.exe']);
    const changes: string[] = [];
    watcher.on('change', (change) => changes.push(change.profileId));
    watcher.start();
    vi.advanceTimersByTime(6000);
    expect(watcher.getActive()).toEqual({ profileId: 'shooter', matchedBy: 'process', matchedName: 'game.exe' });
    expect(changes).toEqual(['shooter']);

    watcher.pinProfile('shooter');
    expect(changes).toEqual(['shooter']);
    expect(watcher.getActive().matchedBy).toBe('pin');

    watcher.pinProfile(null);
    expect(changes).toEqual(['shooter']);
    expect(watcher.getActive().matchedBy).toBe('process');
    watcher.stop();
  });

  it('reports matchedName again after clearing a pin while the process still matches', () => {
    const watcher = makeWatcher(() => ['game.exe']);
    watcher.start();
    vi.advanceTimersByTime(6000);
    watcher.pinProfile('shooter');
    expect(watcher.getActive().matchedName).toBeNull();

    watcher.pinProfile(null);
    expect(watcher.getActive().matchedName).toBe('game.exe');
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

function rawProc(
  comm: string,
  argv0Basename: string | null,
  exePath: string | null = null
): RawProcessInfo {
  return { comm, argv0Basename, exePath };
}

describe('listCandidateGameProcesses', () => {
  it('classifies .exe processes as proton tier, excluding the wine-plumbing blocklist', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('game.exe', 'game.exe', 'C:/games/game.exe'),
      rawProc('wineserver', 'wineserver'),
      rawProc('services.exe', 'services.exe'),
      rawProc('steam.exe', 'steam.exe')
    ]);
    expect(candidates).toEqual([{ name: 'game.exe', kind: 'proton' }]);
  });

  it('excludes anti-cheat processes by prefix match', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('game.exe', 'game.exe'),
      rawProc('easyanticheat_launcher.exe', 'easyanticheat_launcher.exe'),
      rawProc('battleye_launcher.exe', 'battleye_launcher.exe')
    ]);
    expect(candidates).toEqual([{ name: 'game.exe', kind: 'proton' }]);
  });

  it('detects game-path tier from exe path substrings, case-insensitively', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('mygame', 'mygame', '/home/user/.steam/steamapps/common/MyGame/mygame'),
      rawProc('othergame', 'othergame', '/home/user/Games/OtherGame/othergame'),
      rawProc('heroicgame', 'heroicgame', '/home/user/Heroic/Games/heroicgame'),
      rawProc('lutrisgame', 'lutrisgame', '/home/user/Lutris/lutrisgame'),
      rawProc('bottlesgame', 'bottlesgame', '/home/user/Bottles/bottlesgame'),
      rawProc('notagame', 'notagame', '/usr/bin/notagame')
    ]);
    expect(candidates).toEqual([
      { name: 'bottlesgame', kind: 'game-path' },
      { name: 'heroicgame', kind: 'game-path' },
      { name: 'lutrisgame', kind: 'game-path' },
      { name: 'mygame', kind: 'game-path' },
      { name: 'othergame', kind: 'game-path' }
    ]);
  });

  it('orders proton tier first, then game-path tier, each alphabetical', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('zeta.exe', 'zeta.exe'),
      rawProc('alpha.exe', 'alpha.exe'),
      rawProc('zetagame', 'zetagame', '/games/zetagame'),
      rawProc('alphagame', 'alphagame', '/games/alphagame')
    ]);
    expect(candidates).toEqual([
      { name: 'alpha.exe', kind: 'proton' },
      { name: 'zeta.exe', kind: 'proton' },
      { name: 'alphagame', kind: 'game-path' },
      { name: 'zetagame', kind: 'game-path' }
    ]);
  });

  it('falls back to the other tier only when proton and game-path tiers are both empty', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('mygame', 'mygame', '/home/user/mygame/mygame'),
      rawProc('bash', 'bash'),
      rawProc('systemd', 'systemd'),
      rawProc('', null)
    ]);
    expect(candidates).toEqual([{ name: 'mygame', kind: 'other' }]);
  });

  it('excludes the system blocklist and kernel threads from the other tier', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('bash', 'bash'),
      rawProc('zsh', 'zsh'),
      rawProc('sh', 'sh'),
      rawProc('systemd-journald', 'systemd-journald'),
      rawProc('dbus-daemon', 'dbus-daemon'),
      rawProc('pipewire-pulse', 'pipewire-pulse'),
      rawProc('wireplumber', 'wireplumber'),
      rawProc('Xwayland', 'Xwayland'),
      rawProc('firefox', 'firefox'),
      rawProc('chrome', 'chrome'),
      rawProc('chromium', 'chromium'),
      rawProc('electron', 'electron'),
      rawProc('ds5-bridge', 'ds5-bridge'),
      rawProc('', null),
      rawProc('mytool', 'mytool')
    ]);
    expect(candidates).toEqual([{ name: 'mytool', kind: 'other' }]);
  });

  it('caps the other tier at 30 and sorts alphabetically', () => {
    const procs = Array.from({ length: 40 }, (_, index) => rawProc(`proc${String(index).padStart(2, '0')}`, `proc${String(index).padStart(2, '0')}`));
    const candidates = listCandidateGameProcesses(() => procs);
    expect(candidates).toHaveLength(30);
    expect(candidates.every((candidate) => candidate.kind === 'other')).toBe(true);
    const names = candidates.map((candidate) => candidate.name);
    expect(names).toEqual([...names].sort());
  });

  it('dedupes candidates by name', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('game.exe', 'game.exe'),
      rawProc('game.exe', 'game.exe')
    ]);
    expect(candidates).toEqual([{ name: 'game.exe', kind: 'proton' }]);
  });

  it('normalizes names using backslash-normalized lowercase basenames, matching the watcher', () => {
    const candidates = listCandidateGameProcesses(() => [
      rawProc('GAME.EXE', 'C:\\Games\\GAME.EXE')
    ]);
    expect(candidates).toEqual([{ name: 'game.exe', kind: 'proton' }]);
  });

  it('returns an empty list when the process read fails entirely', () => {
    const candidates = listCandidateGameProcesses(() => {
      throw new Error('boom');
    });
    expect(candidates).toEqual([]);
  });
});
