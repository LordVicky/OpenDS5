import type { LibraryCatalog, LibraryEntry } from '../main/profile-library';

/**
 * Matches a game name typed in the Add Game dialog against the OpenDS5-Profiles
 * catalog. The catalog is the single source of truth for what a new game gets:
 *
 *  - a native game (PCGamingWiki list) keeps the default trigger feel — the game
 *    drives the triggers itself, a custom profile would fight it;
 *  - a game with a published profile installs that profile (verified over community);
 *  - anything else starts with no custom triggers at all.
 */
export type GameLibraryMatch =
  | { kind: 'native' }
  | { kind: 'profile'; entry: LibraryEntry }
  | { kind: 'none' };

export function normalizeGameName(value: string): string {
  return value.trim().toLowerCase();
}

export function matchGameInLibrary(catalog: LibraryCatalog | null, name: string): GameLibraryMatch {
  const query = normalizeGameName(name);
  if (!catalog || !query) return { kind: 'none' };
  if (catalog.nativeGames.some((native) => normalizeGameName(native.game) === query)) {
    return { kind: 'native' };
  }
  const entries = catalog.entries.filter((entry) => normalizeGameName(entry.game) === query);
  if (entries.length > 0) {
    const verified = entries.find((entry) => entry.tier === 'verified');
    return { kind: 'profile', entry: verified ?? entries[0] };
  }
  return { kind: 'none' };
}

/** Normalized native-game name set, for flagging existing tiles as native. */
export function nativeGameNameSet(catalog: LibraryCatalog | null): ReadonlySet<string> {
  return new Set((catalog?.nativeGames ?? []).map((native) => normalizeGameName(native.game)));
}

export function isNativeGame(
  nativeNames: ReadonlySet<string>,
  profile: { name: string; meta?: { game?: string } }
): boolean {
  return nativeNames.has(normalizeGameName(profile.meta?.game ?? profile.name));
}
