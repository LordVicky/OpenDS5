import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Cover art for Game Profile tiles, fetched from SteamGridDB with the user's own API key
 * (https://www.steamgriddb.com/profile/preferences/api). Images are cached on disk keyed
 * by trigger profile id; an index file remembers which SteamGridDB game each image came
 * from. Everything here is best-effort decoration: a failed fetch leaves the tile on its
 * generated monogram, never breaks a profile.
 */

const API_BASE = 'https://www.steamgriddb.com/api/v2';
// Keyless cover lookup, the way Heroic Games Launcher fetches sideload covers:
// Bottles' SteamGridDB proxy answers GET /api/search/<name> with a JSON string
// holding the best grid URL. No API key, no account.
const KEYLESS_SEARCH_BASE = 'https://steamgrid.usebottles.com/api/search/';
const FETCH_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 1048576;
const MAX_IMAGE_BYTES = 4194304;
const INDEX_FILE = 'artwork-index.json';
// 600x900 is SteamGridDB's standard portrait grid — the same shape as the tile.
const GRID_DIMENSIONS = '600x900';

export interface GameArtworkSearchResult {
  id: number;
  name: string;
}

export interface GameArtworkEntry {
  fileName: string;
  gameId: number;
  gameName: string;
}

type ArtworkIndex = Record<string, GameArtworkEntry>;

const EXTENSION_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function imageExtensionFromUrl(url: string): string {
  const match = /\.(png|jpe?g|webp)(?:$|\?)/i.exec(url);
  if (!match) return '.png';
  const ext = `.${match[1].toLowerCase()}`;
  return ext === '.jpeg' ? '.jpg' : ext;
}

function safeFileBase(triggerProfileId: string): string {
  return triggerProfileId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export class GameArtworkStore {
  private readonly directory: string;
  private readonly indexPath: string;
  private readonly fetchImpl: typeof fetch;

  constructor(directory: string, fetchImpl: typeof fetch = fetch) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
    this.indexPath = path.join(directory, INDEX_FILE);
    this.fetchImpl = fetchImpl;
  }

  async search(apiKey: string, term: string): Promise<GameArtworkSearchResult[]> {
    const query = term.trim();
    if (!apiKey) throw new Error('Add your SteamGridDB API key first');
    if (!query) return [];
    const payload = await this.request(apiKey, `/search/autocomplete/${encodeURIComponent(query)}`);
    if (!Array.isArray(payload)) return [];
    return payload
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .filter((entry) => typeof entry.id === 'number' && typeof entry.name === 'string')
      .slice(0, 20)
      .map((entry) => ({ id: entry.id as number, name: entry.name as string }));
  }

  /**
   * Downloads the first portrait grid for a SteamGridDB game and stores it as this
   * profile's artwork, replacing any previous image.
   */
  async apply(
    apiKey: string,
    triggerProfileId: string,
    game: GameArtworkSearchResult
  ): Promise<GameArtworkEntry> {
    if (!apiKey) throw new Error('Add your SteamGridDB API key first');
    const grids = await this.request(apiKey, `/grids/game/${game.id}?dimensions=${GRID_DIMENSIONS}&types=static`);
    const first = Array.isArray(grids)
      ? grids.find((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).url === 'string'
      ))
      : undefined;
    if (!first) throw new Error(`No ${GRID_DIMENSIONS} artwork found for ${game.name}`);
    const url = first.url as string;
    return this.downloadAndStore(triggerProfileId, url, game.id, game.name);
  }

  /**
   * Keyless auto-fetch via the Bottles steamgrid proxy — one request in, one
   * cover out. Null when the proxy has no match, so callers can fall through
   * to the key-based API or the generated monogram.
   */
  async autoFetchKeyless(triggerProfileId: string, term: string): Promise<GameArtworkEntry | null> {
    const query = term.trim();
    if (!query) return null;
    const response = await this.fetchImpl(`${KEYLESS_SEARCH_BASE}${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) return null;
    let url: unknown;
    try {
      url = JSON.parse(text);
    } catch {
      return null;
    }
    if (typeof url !== 'string' || !url.startsWith('https://')) return null;
    return this.downloadAndStore(triggerProfileId, url, 0, query);
  }

  /** Stores a cover downloaded from a known URL (e.g. Heroic's art_cover). */
  async applyFromUrl(triggerProfileId: string, url: string, gameName: string): Promise<GameArtworkEntry> {
    return this.downloadAndStore(triggerProfileId, url, 0, gameName);
  }

  /** Stores a cover from a local file (e.g. Steam's librarycache jpg). */
  applyFromFile(triggerProfileId: string, filePath: string, gameName: string): GameArtworkEntry {
    const bytes = readFileSync(filePath);
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Artwork exceeds ${MAX_IMAGE_BYTES} bytes`);
    }
    this.remove(triggerProfileId);
    const extension = path.extname(filePath).toLowerCase();
    const fileName = `${safeFileBase(triggerProfileId)}${EXTENSION_MIME[extension] ? extension : '.jpg'}`;
    writeFileSync(path.join(this.directory, fileName), bytes);
    const entry: GameArtworkEntry = { fileName, gameId: 0, gameName };
    const index = this.readIndex();
    index[triggerProfileId] = entry;
    this.writeIndex(index);
    return entry;
  }

  private async downloadAndStore(
    triggerProfileId: string,
    url: string,
    gameId: number,
    gameName: string
  ): Promise<GameArtworkEntry> {
    if (!url.startsWith('https://')) throw new Error('Artwork must be served over HTTPS');

    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Artwork download failed with status ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Artwork exceeds ${MAX_IMAGE_BYTES} bytes`);
    }

    this.remove(triggerProfileId);
    const fileName = `${safeFileBase(triggerProfileId)}${imageExtensionFromUrl(url)}`;
    writeFileSync(path.join(this.directory, fileName), bytes);
    const entry: GameArtworkEntry = { fileName, gameId, gameName };
    const index = this.readIndex();
    index[triggerProfileId] = entry;
    this.writeIndex(index);
    return entry;
  }

  /** Search-by-name convenience: first result wins. Null when nothing matches. */
  async autoFetch(apiKey: string, triggerProfileId: string, term: string): Promise<GameArtworkEntry | null> {
    const results = await this.search(apiKey, term);
    if (results.length === 0) return null;
    return this.apply(apiKey, triggerProfileId, results[0]);
  }

  remove(triggerProfileId: string): void {
    const index = this.readIndex();
    const entry = index[triggerProfileId];
    if (!entry) return;
    delete index[triggerProfileId];
    this.writeIndex(index);
    try {
      const filePath = path.join(this.directory, entry.fileName);
      if (existsSync(filePath)) rmSync(filePath);
    } catch {
      // A stale file only wastes disk; the index no longer references it.
    }
  }

  /** Data URLs for every cached cover, keyed by trigger profile id. */
  dataUrls(): Record<string, string> {
    const index = this.readIndex();
    const urls: Record<string, string> = {};
    for (const [profileId, entry] of Object.entries(index)) {
      const mime = EXTENSION_MIME[path.extname(entry.fileName).toLowerCase()];
      if (!mime) continue;
      try {
        const bytes = readFileSync(path.join(this.directory, entry.fileName));
        urls[profileId] = `data:${mime};base64,${bytes.toString('base64')}`;
      } catch {
        // Image vanished from disk; skip it and let the monogram show.
      }
    }
    return urls;
  }

  entries(): ArtworkIndex {
    return this.readIndex();
  }

  private async request(apiKey: string, apiPath: string): Promise<unknown> {
    const response = await this.fetchImpl(`${API_BASE}${apiPath}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (response.status === 401) {
      throw new Error('SteamGridDB rejected the API key');
    }
    if (!response.ok) {
      throw new Error(`SteamGridDB request failed with status ${response.status}`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
      throw new Error(`SteamGridDB response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || (parsed as Record<string, unknown>).success !== true) {
      throw new Error('SteamGridDB request was not successful');
    }
    return (parsed as Record<string, unknown>).data;
  }

  private readIndex(): ArtworkIndex {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.indexPath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) return {};
      const index: ArtworkIndex = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue;
        const entry = value as Record<string, unknown>;
        if (
          typeof entry.fileName !== 'string'
          || entry.fileName.includes('/')
          || entry.fileName.includes('\\')
          || typeof entry.gameId !== 'number'
          || typeof entry.gameName !== 'string'
        ) continue;
        index[key] = { fileName: entry.fileName, gameId: entry.gameId, gameName: entry.gameName };
      }
      return index;
    } catch {
      return {};
    }
  }

  private writeIndex(index: ArtworkIndex): void {
    try {
      writeFileSync(this.indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    } catch {
      // Best-effort cache.
    }
  }
}
