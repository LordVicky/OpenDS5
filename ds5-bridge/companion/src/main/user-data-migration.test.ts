import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MIGRATION_ARTIFACTS,
  MIGRATION_MARKER,
  deriveLegacyUserDataPath,
  migrateLegacyUserData,
  type MigrationFsOps
} from './user-data-migration';

interface FakeFsState {
  entries: Set<string>;
  copies: Array<{ src: string; dest: string }>;
  markers: string[];
}

function fakeFs(entries: string[]): MigrationFsOps & FakeFsState {
  const state: FakeFsState = { entries: new Set(entries), copies: [], markers: [] };
  return {
    ...state,
    existsSync: (p: string) => state.entries.has(p),
    mkdirSync: (p: string) => {
      state.entries.add(p);
      return undefined;
    },
    cpSync: (src: string, dest: string, opts: { recursive: boolean }) => {
      expect(opts.recursive).toBe(true);
      state.copies.push({ src, dest });
      state.entries.add(dest);
    },
    writeFileSync: (p: string) => {
      state.markers.push(p);
      state.entries.add(p);
    }
  };
}

const OLD = path.join('/home/user/.config', 'DS5 Bridge');
const NEW = path.join('/home/user/.config', 'OpenDS5');
const MARKER_PATH = path.join(NEW, MIGRATION_MARKER);

describe('deriveLegacyUserDataPath', () => {
  it('replaces the leaf directory with the legacy app name', () => {
    expect(deriveLegacyUserDataPath(NEW)).toBe(OLD);
  });

  it('supports a custom legacy name', () => {
    expect(deriveLegacyUserDataPath(NEW, 'Other Name')).toBe(path.join('/home/user/.config', 'Other Name'));
  });
});

describe('migrateLegacyUserData (fake fs)', () => {
  it('copies every legacy artifact and writes the completion marker', () => {
    const legacyArtifacts = MIGRATION_ARTIFACTS.map((name) => path.join(OLD, name));
    const fsOps = fakeFs([OLD, ...legacyArtifacts]);
    expect(migrateLegacyUserData(OLD, NEW, fsOps)).toBe(true);
    expect(fsOps.copies).toEqual(
      MIGRATION_ARTIFACTS.map((name) => ({ src: path.join(OLD, name), dest: path.join(NEW, name) }))
    );
    expect(fsOps.markers).toEqual([MARKER_PATH]);
  });

  it('runs even when the new dir already holds Electron housekeeping entries', () => {
    const fsOps = fakeFs([
      OLD,
      path.join(OLD, 'settings.json'),
      NEW,
      path.join(NEW, 'SingletonLock'),
      path.join(NEW, 'SingletonCookie'),
      path.join(NEW, 'Crashpad')
    ]);
    expect(migrateLegacyUserData(OLD, NEW, fsOps)).toBe(true);
    expect(fsOps.copies).toEqual([{ src: path.join(OLD, 'settings.json'), dest: path.join(NEW, 'settings.json') }]);
    expect(fsOps.markers).toEqual([MARKER_PATH]);
  });

  it('never overwrites an artifact that already exists in the new dir', () => {
    const fsOps = fakeFs([
      OLD,
      path.join(OLD, 'settings.json'),
      path.join(OLD, 'trigger-profiles'),
      path.join(NEW, 'settings.json')
    ]);
    expect(migrateLegacyUserData(OLD, NEW, fsOps)).toBe(true);
    expect(fsOps.copies).toEqual([
      { src: path.join(OLD, 'trigger-profiles'), dest: path.join(NEW, 'trigger-profiles') }
    ]);
  });

  it('skips entirely once the completion marker exists', () => {
    const fsOps = fakeFs([OLD, path.join(OLD, 'settings.json'), MARKER_PATH]);
    expect(migrateLegacyUserData(OLD, NEW, fsOps)).toBe(false);
    expect(fsOps.copies).toEqual([]);
    expect(fsOps.markers).toEqual([]);
  });

  it('retries missing artifacts when a previous run copied some but wrote no marker', () => {
    const fsOps = fakeFs([
      OLD,
      path.join(OLD, 'settings.json'),
      path.join(OLD, 'trigger-profiles'),
      path.join(NEW, 'settings.json') // copied by a previous run that crashed before the marker
    ]);
    expect(migrateLegacyUserData(OLD, NEW, fsOps)).toBe(true);
    expect(fsOps.copies).toEqual([
      { src: path.join(OLD, 'trigger-profiles'), dest: path.join(NEW, 'trigger-profiles') }
    ]);
    expect(fsOps.markers).toEqual([MARKER_PATH]);
  });

  it('does not write the marker when an artifact copy throws', () => {
    const fsOps = fakeFs([OLD, path.join(OLD, 'settings.json')]);
    fsOps.cpSync = () => {
      throw new Error('disk full');
    };
    expect(() => migrateLegacyUserData(OLD, NEW, fsOps)).toThrow('disk full');
    expect(fsOps.markers).toEqual([]);
  });

  it('copies nothing and skips the marker when the legacy dir does not exist', () => {
    const fsOps = fakeFs([]);
    expect(migrateLegacyUserData(OLD, NEW, fsOps)).toBe(false);
    expect(fsOps.copies).toEqual([]);
    expect(fsOps.markers).toEqual([]);
  });

  it('does nothing when old and new paths are the same', () => {
    const fsOps = fakeFs([OLD, path.join(OLD, 'settings.json')]);
    expect(migrateLegacyUserData(OLD, OLD, fsOps)).toBe(false);
    expect(fsOps.copies).toEqual([]);
    expect(fsOps.markers).toEqual([]);
  });
});

describe('migrateLegacyUserData (real fs)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds5-migration-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('copies nested trigger-profiles and leaves the legacy dir intact', () => {
    const oldDir = path.join(root, 'DS5 Bridge');
    const newDir = path.join(root, 'OpenDS5');
    fs.mkdirSync(path.join(oldDir, 'trigger-profiles'), { recursive: true });
    fs.mkdirSync(path.join(oldDir, 'profile-library'), { recursive: true });
    fs.writeFileSync(path.join(oldDir, 'settings.json'), '{"a":1}');
    fs.writeFileSync(path.join(oldDir, 'window-state.json'), '{"w":1}');
    fs.writeFileSync(path.join(oldDir, 'trigger-profiles', 'game.json'), '{"p":1}');
    fs.writeFileSync(path.join(oldDir, 'profile-library', 'library-cache.json'), '{}');
    // Simulate Electron having already created the new dir with housekeeping.
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, 'SingletonLock'), '');

    expect(migrateLegacyUserData(oldDir, newDir, fs)).toBe(true);

    expect(fs.readFileSync(path.join(newDir, 'settings.json'), 'utf8')).toBe('{"a":1}');
    expect(fs.readFileSync(path.join(newDir, 'window-state.json'), 'utf8')).toBe('{"w":1}');
    expect(fs.readFileSync(path.join(newDir, 'trigger-profiles', 'game.json'), 'utf8')).toBe('{"p":1}');
    expect(fs.readFileSync(path.join(newDir, 'profile-library', 'library-cache.json'), 'utf8')).toBe('{}');
    expect(fs.existsSync(path.join(newDir, MIGRATION_MARKER))).toBe(true);
    // Copy, never move: legacy data untouched.
    expect(fs.readFileSync(path.join(oldDir, 'settings.json'), 'utf8')).toBe('{"a":1}');
    // Second run is a no-op thanks to the marker.
    expect(migrateLegacyUserData(oldDir, newDir, fs)).toBe(false);
  });
});
