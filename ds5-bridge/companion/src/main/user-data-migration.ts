import path from 'node:path';

export const LEGACY_APP_NAME = 'DS5 Bridge';

export interface MigrationFsOps {
  existsSync(target: string): boolean;
  readdirSync(target: string): string[];
  cpSync(src: string, dest: string, opts: { recursive: boolean }): void;
}

/**
 * Derives the pre-rebrand userData directory ("DS5 Bridge") from the current
 * Electron userData path by replacing its leaf directory name.
 */
export function deriveLegacyUserDataPath(newUserDataPath: string, legacyName: string = LEGACY_APP_NAME): string {
  return path.join(path.dirname(newUserDataPath), legacyName);
}

/**
 * One-time migration for the DS5 Bridge -> OpenDS5 rebrand: if the new
 * userData dir is missing or empty and the legacy dir exists, recursively
 * copies (never moves) the legacy contents into the new location so
 * settings, trigger profiles, engine state, and window state survive the
 * productName change. Returns true when a copy was performed.
 */
export function migrateLegacyUserData(oldPath: string, newPath: string, fsOps: MigrationFsOps): boolean {
  if (oldPath === newPath) {
    return false;
  }
  if (!fsOps.existsSync(oldPath)) {
    return false;
  }
  if (fsOps.existsSync(newPath) && fsOps.readdirSync(newPath).length > 0) {
    return false;
  }
  fsOps.cpSync(oldPath, newPath, { recursive: true });
  return true;
}
