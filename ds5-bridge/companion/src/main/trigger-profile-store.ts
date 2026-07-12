import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createDefaultProfile,
  DEFAULT_PROFILE_ID,
  uniqueTriggerProfileId,
  validateTriggerProfile,
  type TriggerProfile
} from '../shared/trigger-profiles';

export interface TriggerEngineState {
  enabled: boolean;
  pinnedProfileId: string | null;
}

const ENGINE_STATE_FILE = 'engine-state.json';

export const MAX_PROFILE_FILE_BYTES = 262144;

export type ImportResult =
  | { ok: true; profile: TriggerProfile }
  | { ok: false; error: string };

export type ReadForImportResult =
  | { ok: true; parsed: unknown }
  | { ok: false; error: string };

/**
 * Reads a profile file for import, enforcing the size guard and JSON parsing.
 * fs-only and Electron-free so it can be unit-tested directly.
 */
export function readProfileFileForImport(filePath: string): ReadForImportResult {
  try {
    const size = statSync(filePath).size;
    if (size > MAX_PROFILE_FILE_BYTES) {
      return { ok: false, error: `File exceeds ${MAX_PROFILE_FILE_BYTES} bytes` };
    }
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return { ok: true, parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to read file' };
  }
}

export class TriggerProfileStore {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }

  loadEngineState(): TriggerEngineState {
    const fallback: TriggerEngineState = { enabled: false, pinnedProfileId: null };
    try {
      const parsed: unknown = JSON.parse(
        readFileSync(path.join(this.directory, ENGINE_STATE_FILE), 'utf8')
      );
      if (typeof parsed !== 'object' || parsed === null) return fallback;
      const candidate = parsed as Partial<TriggerEngineState>;
      return {
        enabled: candidate.enabled === true,
        pinnedProfileId: typeof candidate.pinnedProfileId === 'string' ? candidate.pinnedProfileId : null
      };
    } catch {
      return fallback;
    }
  }

  saveEngineState(state: TriggerEngineState): void {
    writeFileSync(
      path.join(this.directory, ENGINE_STATE_FILE),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8'
    );
  }

  list(): TriggerProfile[] {
    const profiles = new Map<string, TriggerProfile>();
    profiles.set(DEFAULT_PROFILE_ID, createDefaultProfile());
    for (const entry of readdirSync(this.directory)) {
      if (!entry.endsWith('.json') || entry === ENGINE_STATE_FILE) continue;
      const filePath = path.join(this.directory, entry);
      try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
        const result = validateTriggerProfile(parsed);
        if (result.ok) {
          profiles.set(result.profile.id, result.profile);
        } else {
          console.warn(`Skipping invalid trigger profile ${entry}: ${result.error}`);
        }
      } catch (error) {
        console.warn(`Skipping unreadable trigger profile ${entry}:`, error);
      }
    }
    return [...profiles.values()].sort((a, b) => {
      if (a.id === DEFAULT_PROFILE_ID) return -1;
      if (b.id === DEFAULT_PROFILE_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  get(id: string): TriggerProfile | null {
    return this.list().find((profile) => profile.id === id) ?? null;
  }

  save(profile: TriggerProfile): TriggerProfile {
    const stamped = { ...profile, updatedAtMs: Date.now() };
    const result = validateTriggerProfile(stamped);
    if (!result.ok) {
      throw new Error(`Invalid trigger profile: ${result.error}`);
    }
    writeFileSync(this.profilePath(stamped.id), `${JSON.stringify(result.profile, null, 2)}\n`, 'utf8');
    return result.profile;
  }

  /**
   * Always-copy import: validates the incoming profile, assigns a fresh id and
   * a collision-free display name, and stamps meta.source. `libraryFile` records which
   * library entry a library install came from, so the library can tell it is already
   * installed and the editor can reset it back to the published version.
   */
  importProfile(parsed: unknown, source: 'library' | 'import', libraryFile?: string): ImportResult {
    const result = validateTriggerProfile(parsed);
    if (!result.ok) return { ok: false, error: result.error };
    const existing = this.list();
    const existingIds = existing.map((entry) => entry.id);
    const existingNames = new Set(existing.map((entry) => entry.name));
    const name = this.uniqueName(result.profile.name, existingNames);
    const id = uniqueTriggerProfileId(name, existingIds);
    const copy: TriggerProfile = {
      ...result.profile,
      id,
      name,
      meta: { ...result.profile.meta, source, ...(libraryFile ? { libraryFile } : {}) }
    };
    return { ok: true, profile: this.save(copy) };
  }

  /**
   * Overwrite an installed profile with a freshly-fetched copy of the library profile it came
   * from, keeping its id and display name. This is a reset, not an install: routing it through
   * importProfile would take the uniqueName path and leave the edited profile in place
   * alongside a new "Name (2)".
   */
  resetToLibrary(id: string, parsed: unknown): ImportResult {
    const current = this.get(id);
    if (!current) return { ok: false, error: `No profile with id ${id}` };
    const result = validateTriggerProfile(parsed);
    if (!result.ok) return { ok: false, error: result.error };
    const restored: TriggerProfile = {
      ...result.profile,
      id: current.id,
      name: current.name,
      meta: {
        ...result.profile.meta,
        source: 'library',
        ...(current.meta?.libraryFile ? { libraryFile: current.meta.libraryFile } : {})
      }
    };
    return { ok: true, profile: this.save(restored) };
  }

  private uniqueName(name: string, taken: Set<string>): string {
    if (!taken.has(name)) return name;
    let suffix = 2;
    while (taken.has(`${name} (${suffix})`)) suffix += 1;
    return `${name} (${suffix})`;
  }

  delete(id: string): boolean {
    if (id === DEFAULT_PROFILE_ID) return false;
    const filePath = this.profilePath(id);
    if (!existsSync(filePath)) return false;
    rmSync(filePath);
    return true;
  }

  private profilePath(id: string): string {
    return path.join(this.directory, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  }
}
