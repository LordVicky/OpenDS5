// Search over the profile library. The library is browsed by game, so a row is either an
// installable profile or a game that drives its own triggers and has nothing to install.
import type { LibraryCatalog, LibraryEntry } from '../main/profile-library';

export type LibraryRow =
  | { kind: 'profile'; key: string; entry: LibraryEntry }
  | { kind: 'native'; key: string; game: string };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Verified profiles sort above community ones; ties break alphabetically by game so the
// order is stable rather than dependent on index order.
function byTierThenGame(a: LibraryEntry, b: LibraryEntry): number {
  if (a.tier !== b.tier) return a.tier === 'verified' ? -1 : 1;
  return a.game.localeCompare(b.game) || a.name.localeCompare(b.name);
}

export function filterLibrary(catalog: LibraryCatalog, query: string): LibraryRow[] {
  const q = normalize(query);
  const profiles = [...catalog.entries].sort(byTierThenGame);

  // With no query, show the installable profiles only. The native list has nothing to
  // install and is long, so listing it here would just reintroduce the scrolling that the
  // search box exists to remove.
  if (q === '') {
    return profiles.map((entry) => ({ kind: 'profile', key: entry.file, entry }));
  }

  const rows: LibraryRow[] = profiles
    .filter(
      (entry) =>
        normalize(entry.game).includes(q) ||
        normalize(entry.name).includes(q) ||
        normalize(entry.author).includes(q)
    )
    .map((entry) => ({ kind: 'profile', key: entry.file, entry }));

  for (const native of catalog.nativeGames) {
    if (normalize(native.game).includes(q)) {
      rows.push({ kind: 'native', key: `native:${native.game}`, game: native.game });
    }
  }

  return rows;
}
