import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_PROFILE_FILE_BYTES,
  readProfileFileForImport,
  TriggerProfileStore
} from './trigger-profile-store';
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

describe('TriggerProfileStore importProfile', () => {
  it('assigns a fresh id when the incoming id already exists', () => {
    store.save(profile);
    const result = store.importProfile(profile, 'import');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.id).not.toBe('generic-shooter');
      expect(store.get(result.profile.id)).not.toBeNull();
    }
  });

  it('suffixes colliding names and produces distinct ids on repeat imports', () => {
    const first = store.importProfile(profile, 'import');
    const second = store.importProfile(profile, 'import');
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.profile.id).not.toBe(second.profile.id);
      expect(first.profile.name).not.toBe(second.profile.name);
      expect(second.profile.name).toBe('Generic Shooter (2)');
    }
  });

  it('stamps meta.source', () => {
    const result = store.importProfile(profile, 'import');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.meta?.source).toBe('import');
  });

  it('rejects unknown meta keys', () => {
    const result = store.importProfile({ ...profile, meta: { bogusMeta: 'x' } }, 'import');
    expect(result.ok).toBe(false);
  });

  it('rejects meta fields over 500 chars', () => {
    const result = store.importProfile({ ...profile, meta: { author: 'x'.repeat(501) } }, 'import');
    expect(result.ok).toBe(false);
  });

  it('rejects a garbage profile', () => {
    const result = store.importProfile({ nope: true }, 'import');
    expect(result.ok).toBe(false);
  });

  it('records the library file a library install came from', () => {
    const result = store.importProfile(profile, 'library', 'generic-shooter.json');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.meta?.libraryFile).toBe('generic-shooter.json');
      expect(result.profile.meta?.source).toBe('library');
    }
  });

  it('leaves libraryFile unset for a disk import', () => {
    const result = store.importProfile(profile, 'import');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.meta?.libraryFile).toBeUndefined();
  });

  it('rejects a libraryFile that is a path rather than a bare file name', () => {
    const result = store.importProfile(
      { ...profile, meta: { libraryFile: '../evil.json' } },
      'import'
    );
    expect(result.ok).toBe(false);
  });
});

describe('TriggerProfileStore resetToLibrary', () => {
  const installed = { ...profile, name: 'Generic Shooter' };

  function install() {
    const result = store.importProfile(installed, 'library', 'generic-shooter.json');
    if (!result.ok) throw new Error(result.error);
    return result.profile;
  }

  it('overwrites the profile in place instead of creating a second copy', () => {
    const original = install();
    store.save({ ...original, name: original.name, triggers: { ...original.triggers, l2: { base: null, modifiers: [] } } });

    const result = store.resetToLibrary(original.id, installed);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.id).toBe(original.id);
      expect(result.profile.name).toBe(original.name);
      // The edit is gone: the published base effect is back.
      expect(result.profile.triggers.l2.base).toEqual(installed.triggers.l2.base);
    }
    // Crucially, no "Generic Shooter (2)".
    expect(store.list().filter((p) => p.id !== 'default')).toHaveLength(1);
  });

  it('keeps the libraryFile so the profile can be reset again', () => {
    const original = install();
    const result = store.resetToLibrary(original.id, installed);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.meta?.libraryFile).toBe('generic-shooter.json');
  });

  it('fails for an unknown id', () => {
    const result = store.resetToLibrary('nope', installed);
    expect(result.ok).toBe(false);
  });

  it('rejects a garbage payload without touching the stored profile', () => {
    const original = install();
    const result = store.resetToLibrary(original.id, { nope: true });
    expect(result.ok).toBe(false);
    expect(store.get(original.id)?.name).toBe(original.name);
  });
});

describe('readProfileFileForImport', () => {
  it('rejects a file larger than MAX_PROFILE_FILE_BYTES', () => {
    const big = path.join(dir, 'big.json');
    writeFileSync(big, JSON.stringify({ blob: 'x'.repeat(300 * 1024) }), 'utf8');
    const result = readProfileFileForImport(big);
    expect(result.ok).toBe(false);
    expect(MAX_PROFILE_FILE_BYTES).toBe(262144);
  });

  it('reads and parses a small valid JSON file', () => {
    const small = path.join(dir, 'small.json');
    writeFileSync(small, JSON.stringify(profile), 'utf8');
    const result = readProfileFileForImport(small);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parsed).toMatchObject({ id: 'generic-shooter' });
  });

  it('rejects malformed JSON', () => {
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, '{not json', 'utf8');
    expect(readProfileFileForImport(bad).ok).toBe(false);
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
