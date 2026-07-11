import path from 'node:path';

export const LEGACY_APP_NAME = 'DS5 Bridge';

/**
 * The persisted state worth carrying across the DS5 Bridge -> OpenDS5
 * productName change. Everything else in the legacy Chromium profile
 * (Singleton*, Cache, Crashpad, GPUCache, Local Storage, ...) is
 * regenerable housekeeping and is deliberately not copied.
 */
export const MIGRATION_ARTIFACTS = [
  'settings.json',
  'window-state.json',
  'trigger-profiles',
  'profile-library'
] as const;

/** Written only after every artifact copy succeeded; gates re-runs. */
export const MIGRATION_MARKER = '.migrated-from-ds5-bridge';

export interface MigrationFsOps {
  existsSync(target: string): boolean;
  mkdirSync(target: string, opts: { recursive: boolean }): unknown;
  cpSync(src: string, dest: string, opts: { recursive: boolean }): void;
  writeFileSync(target: string, data: string): void;
}

/**
 * Derives the pre-rebrand userData directory ("DS5 Bridge") from the current
 * Electron userData path by replacing its leaf directory name.
 */
export function deriveLegacyUserDataPath(newUserDataPath: string, legacyName: string = LEGACY_APP_NAME): string {
  return path.join(path.dirname(newUserDataPath), legacyName);
}

/**
 * One-time migration for the DS5 Bridge -> OpenDS5 rebrand. Copies (never
 * moves) each known artifact from the legacy userData dir into the new one,
 * skipping artifacts that already exist at the destination, then writes a
 * completion marker. If a copy fails, the marker is not written and the
 * missing artifacts are retried on the next launch. Robust against Electron
 * pre-populating the new dir with housekeeping entries (Singleton*, Cache,
 * Crashpad, ...) because it never inspects overall dir emptiness.
 * Returns true when at least one artifact was copied.
 */
export function migrateLegacyUserData(oldPath: string, newPath: string, fsOps: MigrationFsOps): boolean {
  if (oldPath === newPath) {
    return false;
  }
  if (!fsOps.existsSync(oldPath)) {
    return false;
  }
  if (fsOps.existsSync(path.join(newPath, MIGRATION_MARKER))) {
    return false;
  }
  fsOps.mkdirSync(newPath, { recursive: true });
  let copiedAny = false;
  for (const artifact of MIGRATION_ARTIFACTS) {
    const src = path.join(oldPath, artifact);
    const dest = path.join(newPath, artifact);
    if (!fsOps.existsSync(src) || fsOps.existsSync(dest)) {
      continue;
    }
    fsOps.cpSync(src, dest, { recursive: true });
    copiedAny = true;
  }
  fsOps.writeFileSync(
    path.join(newPath, MIGRATION_MARKER),
    `migrated from "${oldPath}" at ${new Date().toISOString()}\n`
  );
  return copiedAny;
}
