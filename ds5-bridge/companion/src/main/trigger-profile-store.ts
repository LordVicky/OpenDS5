import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createDefaultProfile,
  DEFAULT_PROFILE_ID,
  validateTriggerProfile,
  type TriggerProfile
} from '../shared/trigger-profiles';

export class TriggerProfileStore {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }

  list(): TriggerProfile[] {
    const profiles = new Map<string, TriggerProfile>();
    profiles.set(DEFAULT_PROFILE_ID, createDefaultProfile());
    for (const entry of readdirSync(this.directory)) {
      if (!entry.endsWith('.json')) continue;
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
