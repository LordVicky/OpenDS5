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

describe('TriggerProfileStore engine state', () => {
  it('round-trips enabled and pin state, defaulting to disabled/auto', () => {
    expect(store.loadEngineState()).toEqual({ enabled: false, pinnedProfileId: null });
    store.saveEngineState({ enabled: true, pinnedProfileId: 'default' });
    expect(store.loadEngineState()).toEqual({ enabled: true, pinnedProfileId: 'default' });
    store.saveEngineState({ enabled: true, pinnedProfileId: null });
    expect(store.loadEngineState()).toEqual({ enabled: true, pinnedProfileId: null });
  });

  it('does not surface the engine state file as a profile', () => {
    store.saveEngineState({ enabled: true, pinnedProfileId: null });
    const profiles = store.list();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe('default');
  });

  it('falls back to defaults on corrupt state files', () => {
    writeFileSync(path.join(dir, 'engine-state.json'), 'not json', 'utf8');
    expect(store.loadEngineState()).toEqual({ enabled: false, pinnedProfileId: null });
  });
});
