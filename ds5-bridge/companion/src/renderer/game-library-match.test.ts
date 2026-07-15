import { describe, expect, it } from 'vitest';
import { isNativeGame, matchGameInLibrary, nativeGameNameSet } from './game-library-match';
import type { LibraryCatalog, LibraryEntry } from '../main/profile-library';

function entry(overrides: Partial<LibraryEntry>): LibraryEntry {
  return {
    file: 'game.json',
    name: 'Profile',
    game: 'Some Game',
    author: 'a',
    description: '',
    capabilities: '',
    tier: 'community',
    ...overrides
  };
}

function catalog(overrides: Partial<LibraryCatalog>): LibraryCatalog {
  return { entries: [], nativeGames: [], fetchedAtMs: 0, fromCache: false, ...overrides };
}

describe('matchGameInLibrary', () => {
  it('returns none without a catalog or with a blank name', () => {
    expect(matchGameInLibrary(null, 'Stray')).toEqual({ kind: 'none' });
    expect(matchGameInLibrary(catalog({}), '   ')).toEqual({ kind: 'none' });
  });

  it('flags native games case-insensitively', () => {
    const cat = catalog({ nativeGames: [{ game: 'Ghost of Tsushima' }] });
    expect(matchGameInLibrary(cat, 'ghost of tsushima')).toEqual({ kind: 'native' });
    expect(matchGameInLibrary(cat, ' GHOST OF TSUSHIMA ')).toEqual({ kind: 'native' });
  });

  it('native listing wins over a published profile for the same game', () => {
    const cat = catalog({
      nativeGames: [{ game: 'Stray' }],
      entries: [entry({ game: 'Stray' })]
    });
    expect(matchGameInLibrary(cat, 'Stray')).toEqual({ kind: 'native' });
  });

  it('finds a published profile and prefers verified over community', () => {
    const community = entry({ game: 'Elden Ring', file: 'c.json', tier: 'community' });
    const verified = entry({ game: 'Elden Ring', file: 'v.json', tier: 'verified' });
    const cat = catalog({ entries: [community, verified] });
    expect(matchGameInLibrary(cat, 'elden ring')).toEqual({ kind: 'profile', entry: verified });
  });

  it('falls back to the first community entry when nothing is verified', () => {
    const first = entry({ game: 'NieR', file: 'a.json' });
    const cat = catalog({ entries: [first, entry({ game: 'NieR', file: 'b.json' })] });
    expect(matchGameInLibrary(cat, 'NieR')).toEqual({ kind: 'profile', entry: first });
  });
});

describe('isNativeGame', () => {
  it('matches on meta.game first, then the profile name', () => {
    const names = nativeGameNameSet(catalog({ nativeGames: [{ game: 'Ghost of Tsushima' }] }));
    expect(isNativeGame(names, { name: 'got-profile', meta: { game: 'Ghost of Tsushima' } })).toBe(true);
    expect(isNativeGame(names, { name: 'Ghost of Tsushima' })).toBe(true);
    expect(isNativeGame(names, { name: 'Stray' })).toBe(false);
  });
});
