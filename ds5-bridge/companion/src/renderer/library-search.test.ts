import { describe, expect, it } from 'vitest';
import type { LibraryCatalog, LibraryEntry } from '../main/profile-library';
import { filterLibrary } from './library-search';

function entry(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    file: 'a.json',
    name: 'Showcase',
    game: 'NieR Replicant',
    author: 'LordVicky',
    description: 'blurb',
    capabilities: 'L2 multi-zone',
    tier: 'community',
    ...over
  };
}

function catalog(entries: LibraryEntry[], nativeGames: { game: string }[] = []): LibraryCatalog {
  return { entries, nativeGames, fetchedAtMs: 0, fromCache: false };
}

describe('filterLibrary', () => {
  it('shows profiles but not native games when the query is empty', () => {
    const rows = filterLibrary(catalog([entry()], [{ game: 'Elden Ring' }]), '');
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('profile');
  });

  it('sorts verified profiles above community ones', () => {
    const rows = filterLibrary(
      catalog([
        entry({ file: 'c.json', game: 'Aaa', tier: 'community' }),
        entry({ file: 'v.json', game: 'Zzz', tier: 'verified' })
      ]),
      ''
    );
    expect(rows.map((row) => (row.kind === 'profile' ? row.entry.file : ''))).toEqual(['v.json', 'c.json']);
  });

  it('matches on game, profile name, and author', () => {
    const cat = catalog([entry()]);
    expect(filterLibrary(cat, 'nier')).toHaveLength(1);
    expect(filterLibrary(cat, 'showcase')).toHaveLength(1);
    expect(filterLibrary(cat, 'lordvicky')).toHaveLength(1);
    expect(filterLibrary(cat, 'nothing')).toHaveLength(0);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(filterLibrary(catalog([entry()]), '  NIER  ')).toHaveLength(1);
  });

  it('includes native games that match the query', () => {
    const rows = filterLibrary(catalog([], [{ game: 'Elden Ring' }]), 'elden');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'native', game: 'Elden Ring' });
  });

  it('lists matching profiles before matching native games', () => {
    const rows = filterLibrary(
      catalog([entry({ game: 'Ring Fit' })], [{ game: 'Elden Ring' }]),
      'ring'
    );
    expect(rows.map((row) => row.kind)).toEqual(['profile', 'native']);
  });

  it('returns nothing when neither a profile nor a native game matches', () => {
    expect(filterLibrary(catalog([entry()], [{ game: 'Elden Ring' }]), 'hollow knight')).toEqual([]);
  });
});
