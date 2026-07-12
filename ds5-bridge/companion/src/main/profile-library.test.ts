import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIBRARY_INDEX_URL,
  LIBRARY_NATIVE_URL,
  MAX_INDEX_BYTES,
  ProfileLibrary,
  type LibraryEntry,
  type NativeGame
} from './profile-library';

let dir: string;

const validIndex: LibraryEntry[] = [
  {
    file: 'default-showcase.json',
    name: 'Default Showcase',
    game: 'Generic',
    author: 'DS5 Bridge',
    description: 'A showcase profile',
    capabilities: 'L2 multi-zone · R2 slope',
    tier: 'verified'
  }
];

const validNative: NativeGame[] = [{ game: 'Elden Ring' }];

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  const text = JSON.stringify(body);
  return { ok, status, text: () => Promise.resolve(text) } as unknown as Response;
}

function textResponse(text: string, ok = true, status = 200): Response {
  return { ok, status, text: () => Promise.resolve(text) } as unknown as Response;
}

// getCatalog fetches the index and the native list; route by URL so tests can vary each.
function routed(
  index: () => Response | Promise<Response>,
  native: () => Response | Promise<Response> = () => jsonResponse(validNative)
) {
  return vi.fn(async (url: string) => (url === LIBRARY_NATIVE_URL ? native() : index()));
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'profile-library-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('ProfileLibrary.getCatalog', () => {
  it('fetches, validates, and writes the cache on success', async () => {
    const fetchImpl = routed(() => jsonResponse(validIndex));
    const library = new ProfileLibrary(dir, fetchImpl as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.fromCache).toBe(false);
    expect(catalog.error).toBeUndefined();
    expect(catalog.entries).toEqual(validIndex);
    expect(catalog.nativeGames).toEqual(validNative);
    expect(fetchImpl).toHaveBeenCalledWith(LIBRARY_INDEX_URL, expect.anything());
    expect(fetchImpl).toHaveBeenCalledWith(LIBRARY_NATIVE_URL, expect.anything());
    expect(existsSync(path.join(dir, 'library-cache.json'))).toBe(true);
  });

  it('passes an AbortSignal with a 10s timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = routed(() => jsonResponse(validIndex));
    const library = new ProfileLibrary(dir, fetchImpl as unknown as typeof fetch);

    await library.getCatalog();

    expect(timeoutSpy).toHaveBeenCalledWith(10000);
    const options = fetchImpl.mock.calls[0][1] as { signal?: unknown };
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('filters out entries with unsafe file names or missing fields', async () => {
    const dirty = [
      ...validIndex,
      { file: '../evil.json', name: 'Evil', game: 'x', author: 'x', description: 'x' },
      { file: 'ok.json', name: 42, game: 'x', author: 'x', description: 'x' }
    ];
    const library = new ProfileLibrary(dir, routed(() => jsonResponse(dirty)) as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.entries).toEqual(validIndex);
    expect(catalog.error).toBeUndefined();
  });

  it('treats a missing or unknown tier as community, never verified', async () => {
    const untiered = [
      { ...validIndex[0], tier: undefined },
      { ...validIndex[0], file: 'b.json', tier: 'bogus' },
      { ...validIndex[0], file: 'c.json', tier: 'VERIFIED' }
    ];
    const library = new ProfileLibrary(dir, routed(() => jsonResponse(untiered)) as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.entries.map((entry) => entry.tier)).toEqual(['community', 'community', 'community']);
  });

  it('keeps a verified tier', async () => {
    const library = new ProfileLibrary(dir, routed(() => jsonResponse(validIndex)) as unknown as typeof fetch);
    const catalog = await library.getCatalog();
    expect(catalog.entries[0].tier).toBe('verified');
  });

  it('keeps a well-formed origin and drops a malformed one without dropping the entry', async () => {
    const entries = [
      { ...validIndex[0], origin: { kind: 'port', from: 'DualSensity' } },
      { ...validIndex[0], file: 'b.json', origin: { kind: 'bogus', from: 'x' } },
      { ...validIndex[0], file: 'c.json', origin: { kind: 'port', from: '' } },
      { ...validIndex[0], file: 'd.json', origin: 'nonsense' }
    ];
    const library = new ProfileLibrary(dir, routed(() => jsonResponse(entries)) as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.entries).toHaveLength(4);
    expect(catalog.entries[0].origin).toEqual({ kind: 'port', from: 'DualSensity' });
    expect(catalog.entries[1].origin).toBeUndefined();
    expect(catalog.entries[2].origin).toBeUndefined();
    expect(catalog.entries[3].origin).toBeUndefined();
  });

  it('defaults capabilities to an empty string when absent', async () => {
    const entries = [{ ...validIndex[0], capabilities: undefined }];
    const library = new ProfileLibrary(dir, routed(() => jsonResponse(entries)) as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.entries[0].capabilities).toBe('');
  });

  it('still serves the library when the native list fails to load', async () => {
    const library = new ProfileLibrary(
      dir,
      routed(
        () => jsonResponse(validIndex),
        () => {
          throw new Error('native list down');
        }
      ) as unknown as typeof fetch
    );

    const catalog = await library.getCatalog();

    expect(catalog.entries).toEqual(validIndex);
    expect(catalog.nativeGames).toEqual([]);
    expect(catalog.error).toBeUndefined();
  });

  it('drops malformed native entries', async () => {
    const library = new ProfileLibrary(
      dir,
      routed(
        () => jsonResponse(validIndex),
        () => jsonResponse([{ game: 'Elden Ring' }, { game: '' }, { game: 7 }, 'nonsense'])
      ) as unknown as typeof fetch
    );

    const catalog = await library.getCatalog();

    expect(catalog.nativeGames).toEqual([{ game: 'Elden Ring' }]);
  });

  it('falls back to cache when the network throws', async () => {
    const good = new ProfileLibrary(dir, routed(() => jsonResponse(validIndex)) as unknown as typeof fetch);
    await good.getCatalog();

    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const library = new ProfileLibrary(dir, fetchImpl as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.fromCache).toBe(true);
    expect(catalog.entries).toEqual(validIndex);
    expect(catalog.nativeGames).toEqual(validNative);
    expect(catalog.error).toBeDefined();
  });

  it('returns empty entries and an error when the network fails with no cache', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const library = new ProfileLibrary(dir, fetchImpl as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.fromCache).toBe(false);
    expect(catalog.entries).toEqual([]);
    expect(catalog.nativeGames).toEqual([]);
    expect(catalog.error).toBeDefined();
  });

  it('rejects an index larger than MAX_INDEX_BYTES', async () => {
    const huge = 'x'.repeat(MAX_INDEX_BYTES + 1);
    const library = new ProfileLibrary(dir, routed(() => textResponse(huge)) as unknown as typeof fetch);

    const catalog = await library.getCatalog();

    expect(catalog.entries).toEqual([]);
    expect(catalog.error).toBeDefined();
  });

  it('treats a non-200 response as a failure', async () => {
    const library = new ProfileLibrary(
      dir,
      routed(() => jsonResponse(validIndex, false, 500)) as unknown as typeof fetch
    );

    const catalog = await library.getCatalog();

    expect(catalog.entries).toEqual([]);
    expect(catalog.error).toBeDefined();
  });
});

describe('ProfileLibrary.fetchProfile', () => {
  const entry = validIndex[0];

  it('fetches and parses a profile from the library directory URL', async () => {
    const profile = { version: 1, name: 'Default Showcase' };
    const fetchImpl = vi.fn(async () => jsonResponse(profile));
    const library = new ProfileLibrary(dir, fetchImpl as unknown as typeof fetch);

    const parsed = await library.fetchProfile(entry);

    expect(parsed).toEqual(profile);
    expect(fetchImpl).toHaveBeenCalledWith(
      LIBRARY_INDEX_URL.replace('index.json', entry.file),
      expect.anything()
    );
  });

  it('rejects an entry with a path-traversal file name', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const library = new ProfileLibrary(dir, fetchImpl as unknown as typeof fetch);

    await expect(library.fetchProfile({ ...entry, file: '../evil.json' })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a profile file larger than the cap', async () => {
    const huge = 'x'.repeat(300000);
    const fetchImpl = vi.fn(async () => textResponse(huge));
    const library = new ProfileLibrary(dir, fetchImpl as unknown as typeof fetch);

    await expect(library.fetchProfile(entry)).rejects.toThrow();
  });
});
