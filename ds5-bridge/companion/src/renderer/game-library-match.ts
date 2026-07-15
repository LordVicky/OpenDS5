import type { LibraryCatalog, LibraryEntry, NativeGameFeatures } from '../main/profile-library';

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

// Punctuation- and spacing-insensitive: "Director's Cut", "DIRECTORS CUT" and
// "Directors-Cut" are the same game, and store names disagree with the catalog
// exactly this way. Everything non-alphanumeric is squashed out.
export function normalizeGameName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
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

// Entries from a pre-annotation native.json carry no features object; the list
// has always been seeded from adaptive-trigger support, so that is the safe read.
const LEGACY_FEATURES: NativeGameFeatures = { triggers: true, haptics: false, lightbar: false };

/** Normalized game name → native feature support, for flagging tiles and cards. */
export function nativeGameFeatureMap(catalog: LibraryCatalog | null): ReadonlyMap<string, NativeGameFeatures> {
  const map = new Map<string, NativeGameFeatures>();
  for (const native of catalog?.nativeGames ?? []) {
    map.set(normalizeGameName(native.game), native.features ?? LEGACY_FEATURES);
  }
  return map;
}

/** The game's native feature support, or null when it isn't a native game. */
export function nativeGameFeatures(
  features: ReadonlyMap<string, NativeGameFeatures>,
  profile: { name: string; meta?: { game?: string } }
): NativeGameFeatures | null {
  return features.get(normalizeGameName(profile.meta?.game ?? profile.name)) ?? null;
}

export function isNativeGame(
  features: ReadonlyMap<string, NativeGameFeatures>,
  profile: { name: string; meta?: { game?: string } }
): boolean {
  return nativeGameFeatures(features, profile) !== null;
}
