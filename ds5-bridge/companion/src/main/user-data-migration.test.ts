import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { deriveLegacyUserDataPath, migrateLegacyUserData, type MigrationFsOps } from './user-data-migration';

interface FakeFsState {
  dirs: Map<string, string[]>;
  copies: Array<{ src: string; dest: string }>;
}

function fakeFs(dirs: Record<string, string[]>): MigrationFsOps & FakeFsState {
  const state: FakeFsState = { dirs: new Map(Object.entries(dirs)), copies: [] };
  return {
    ...state,
    existsSync: (p: string) => state.dirs.has(p),
    readdirSync: (p: string) => state.dirs.get(p) ?? [],
    cpSync: (src: string, dest: string, opts: { recursive: boolean }) => {
      expect(opts.recursive).toBe(true);
      state.copies.push({ src, dest });
      state.dirs.set(dest, [...(state.dirs.get(src) ?? [])]);
    }
  };
}

const OLD = path.join('/home/user/.config', 'DS5 Bridge');
const NEW = path.join('/home/user/.config', 'OpenDS5');

describe('deriveLegacyUserDataPath', () => {
  it('replaces the leaf directory with the legacy app name', () => {
    expect(deriveLegacyUserDataPath(NEW)).toBe(OLD);
  });

  it('supports a custom legacy name', () => {
    expect(deriveLegacyUserDataPath(NEW, 'Other Name')).toBe(path.join('/home/user/.config', 'Other Name'));
  });
});

describe('migrateLegacyUserData', () => {
  it('copies the legacy dir when the new dir does not exist', () => {
    const fs = fakeFs({ [OLD]: ['settings.json', 'trigger-profiles'] });
    expect(migrateLegacyUserData(OLD, NEW, fs)).toBe(true);
    expect(fs.copies).toEqual([{ src: OLD, dest: NEW }]);
  });

  it('copies the legacy dir when the new dir exists but is empty', () => {
    const fs = fakeFs({ [OLD]: ['settings.json'], [NEW]: [] });
    expect(migrateLegacyUserData(OLD, NEW, fs)).toBe(true);
    expect(fs.copies).toEqual([{ src: OLD, dest: NEW }]);
  });

  it('does nothing when the new dir already has contents', () => {
    const fs = fakeFs({ [OLD]: ['settings.json'], [NEW]: ['settings.json'] });
    expect(migrateLegacyUserData(OLD, NEW, fs)).toBe(false);
    expect(fs.copies).toEqual([]);
  });

  it('does nothing when the legacy dir does not exist', () => {
    const fs = fakeFs({});
    expect(migrateLegacyUserData(OLD, NEW, fs)).toBe(false);
    expect(fs.copies).toEqual([]);
  });

  it('does nothing when old and new paths are the same', () => {
    const fs = fakeFs({ [OLD]: ['settings.json'] });
    expect(migrateLegacyUserData(OLD, OLD, fs)).toBe(false);
    expect(fs.copies).toEqual([]);
  });
});
