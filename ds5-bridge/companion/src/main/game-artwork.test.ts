import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameArtworkStore } from './game-artwork';

type FakeResponse = { status: number; body: string | Buffer };

function makeFetch(routes: Record<string, FakeResponse>): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!route) return new Response('not found', { status: 404 });
    const { status, body } = route[1];
    return new Response(body, { status });
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function searchPayload(): string {
  return JSON.stringify({
    success: true,
    data: [
      { id: 1234, name: 'Cyberpunk 2077' },
      { id: 5678, name: 'Cyberpunk 2077: Phantom Liberty' },
      { id: 'bogus', name: 42 }
    ]
  });
}

function gridsPayload(url: string): string {
  return JSON.stringify({ success: true, data: [{ url }] });
}

describe('GameArtworkStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'game-artwork-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('searches SteamGridDB and drops malformed entries', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/search/autocomplete/': { status: 200, body: searchPayload() }
    });
    const store = new GameArtworkStore(dir, fetch);
    const results = await store.search('key', 'cyberpunk');
    expect(results).toEqual([
      { id: 1234, name: 'Cyberpunk 2077' },
      { id: 5678, name: 'Cyberpunk 2077: Phantom Liberty' }
    ]);
  });

  it('requires an API key before calling out', async () => {
    const { fetch, calls } = makeFetch({});
    const store = new GameArtworkStore(dir, fetch);
    await expect(store.search('', 'cyberpunk')).rejects.toThrow(/API key/);
    expect(calls).toEqual([]);
  });

  it('reports a rejected API key distinctly', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/search/autocomplete/': { status: 401, body: 'nope' }
    });
    const store = new GameArtworkStore(dir, fetch);
    await expect(store.search('bad', 'cyberpunk')).rejects.toThrow(/rejected the API key/);
  });

  it('downloads the first grid, indexes it, and serves a data URL', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/grids/game/1234': {
        status: 200,
        body: gridsPayload('https://cdn.steamgriddb.example/grid/cover.png')
      },
      'https://cdn.steamgriddb.example/grid/cover.png': { status: 200, body: PNG_BYTES }
    });
    const store = new GameArtworkStore(dir, fetch);
    const entry = await store.apply('key', 'cyberpunk-2077', { id: 1234, name: 'Cyberpunk 2077' });
    expect(entry).toEqual({ fileName: 'cyberpunk-2077.png', gameId: 1234, gameName: 'Cyberpunk 2077' });
    expect(readFileSync(path.join(dir, 'cyberpunk-2077.png'))).toEqual(PNG_BYTES);

    const urls = store.dataUrls();
    expect(urls['cyberpunk-2077']).toBe(`data:image/png;base64,${PNG_BYTES.toString('base64')}`);
    expect(store.entries()['cyberpunk-2077'].gameId).toBe(1234);
  });

  it('refuses artwork that is not served over HTTPS', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/grids/game/1234': {
        status: 200,
        body: gridsPayload('http://insecure.example/cover.png')
      }
    });
    const store = new GameArtworkStore(dir, fetch);
    await expect(store.apply('key', 'cyberpunk', { id: 1234, name: 'Cyberpunk 2077' })).rejects.toThrow(/HTTPS/);
  });

  it('fails when a game has no grids', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/grids/game/1234': {
        status: 200,
        body: JSON.stringify({ success: true, data: [] })
      }
    });
    const store = new GameArtworkStore(dir, fetch);
    await expect(store.apply('key', 'cyberpunk', { id: 1234, name: 'Cyberpunk 2077' })).rejects.toThrow(/No 600x900 artwork/);
  });

  it('autoFetch uses the first search result and returns null with no matches', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/search/autocomplete/': {
        status: 200,
        body: JSON.stringify({ success: true, data: [] })
      }
    });
    const store = new GameArtworkStore(dir, fetch);
    expect(await store.autoFetch('key', 'unknown-game', 'Unknown Game')).toBeNull();
  });

  it('remove deletes the image and its index entry', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/grids/game/1234': {
        status: 200,
        body: gridsPayload('https://cdn.steamgriddb.example/grid/cover.jpg')
      },
      'https://cdn.steamgriddb.example/grid/cover.jpg': { status: 200, body: PNG_BYTES }
    });
    const store = new GameArtworkStore(dir, fetch);
    await store.apply('key', 'cyberpunk', { id: 1234, name: 'Cyberpunk 2077' });
    expect(existsSync(path.join(dir, 'cyberpunk.jpg'))).toBe(true);

    store.remove('cyberpunk');
    expect(existsSync(path.join(dir, 'cyberpunk.jpg'))).toBe(false);
    expect(store.dataUrls()).toEqual({});
  });

  it('sanitizes profile ids into safe file names', async () => {
    const { fetch } = makeFetch({
      'https://www.steamgriddb.com/api/v2/grids/game/1234': {
        status: 200,
        body: gridsPayload('https://cdn.steamgriddb.example/grid/cover.png')
      },
      'https://cdn.steamgriddb.example/grid/cover.png': { status: 200, body: PNG_BYTES }
    });
    const store = new GameArtworkStore(dir, fetch);
    const entry = await store.apply('key', '../weird id', { id: 1234, name: 'Weird' });
    expect(entry.fileName).toBe('___weird_id.png');
    expect(existsSync(path.join(dir, '___weird_id.png'))).toBe(true);
  });

  it('fetches a cover keylessly through the Bottles steamgrid proxy', async () => {
    const { fetch, calls } = makeFetch({
      'https://steamgrid.usebottles.com/api/search/': {
        status: 200,
        body: JSON.stringify('https://cdn2.steamgriddb.com/grid/abc.jpg')
      },
      'https://cdn2.steamgriddb.com/grid/abc.jpg': { status: 200, body: PNG_BYTES }
    });
    const store = new GameArtworkStore(dir, fetch);
    const entry = await store.autoFetchKeyless('stray', 'Stray');
    expect(entry).not.toBeNull();
    expect(entry?.fileName).toBe('stray.jpg');
    expect(entry?.gameName).toBe('Stray');
    expect(existsSync(path.join(dir, 'stray.jpg'))).toBe(true);
    expect(calls[0]).toBe('https://steamgrid.usebottles.com/api/search/Stray');
    expect(readFileSync(path.join(dir, 'stray.jpg'))).toEqual(PNG_BYTES);
  });

  it('keyless fetch returns null on proxy miss, junk payloads and non-https urls', async () => {
    const missing = new GameArtworkStore(dir, makeFetch({
      'https://steamgrid.usebottles.com/api/search/': { status: 404, body: 'nope' }
    }).fetch);
    expect(await missing.autoFetchKeyless('a', 'Unknown Game')).toBeNull();

    const junk = new GameArtworkStore(dir, makeFetch({
      'https://steamgrid.usebottles.com/api/search/': { status: 200, body: 'not json {' }
    }).fetch);
    expect(await junk.autoFetchKeyless('a', 'Unknown Game')).toBeNull();

    const insecure = new GameArtworkStore(dir, makeFetch({
      'https://steamgrid.usebottles.com/api/search/': {
        status: 200,
        body: JSON.stringify('http://cdn2.steamgriddb.com/grid/abc.jpg')
      }
    }).fetch);
    expect(await insecure.autoFetchKeyless('a', 'Unknown Game')).toBeNull();
    expect(await insecure.autoFetchKeyless('a', '   ')).toBeNull();
  });

  it('ignores index entries whose file names carry path separators', () => {
    const store = new GameArtworkStore(dir, makeFetch({}).fetch);
    const indexPath = path.join(dir, 'artwork-index.json');
    rmSync(indexPath, { force: true });
    writeFileSync(indexPath, JSON.stringify({
      evil: { fileName: '../../etc/passwd', gameId: 1, gameName: 'Evil' }
    }), 'utf8');
    expect(store.entries()).toEqual({});
  });
});
