import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_PROFILE_FILE_BYTES } from './trigger-profile-store';

export const LIBRARY_INDEX_URL =
  'https://raw.githubusercontent.com/LordVicky/Virtual-DS5-Bridge/main/profiles/library/index.json';
export const MAX_INDEX_BYTES = 1048576;

const FETCH_TIMEOUT_MS = 10000;
const CACHE_FILE = 'library-cache.json';
const FILE_NAME_PATTERN = /^[a-z0-9-]+\.json$/;

export interface LibraryEntry {
  file: string;
  name: string;
  game: string;
  author: string;
  description: string;
}

export interface LibraryCatalog {
  entries: LibraryEntry[];
  fetchedAtMs: number;
  fromCache: boolean;
  error?: string;
}

interface CachedCatalog {
  entries: LibraryEntry[];
  fetchedAtMs: number;
}

function isValidEntry(value: unknown): value is LibraryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.file === 'string' &&
    FILE_NAME_PATTERN.test(entry.file) &&
    typeof entry.name === 'string' &&
    typeof entry.game === 'string' &&
    typeof entry.author === 'string' &&
    typeof entry.description === 'string'
  );
}

function sanitizeEntries(parsed: unknown): LibraryEntry[] {
  if (!Array.isArray(parsed)) {
    throw new Error('Library index is not an array');
  }
  return parsed
    .filter(isValidEntry)
    .map((entry) => ({
      file: entry.file,
      name: entry.name,
      game: entry.game,
      author: entry.author,
      description: entry.description
    }));
}

export class ProfileLibrary {
  private readonly cachePath: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cacheDir: string, fetchImpl: typeof fetch = fetch) {
    mkdirSync(cacheDir, { recursive: true });
    this.cachePath = path.join(cacheDir, CACHE_FILE);
    this.fetchImpl = fetchImpl;
  }

  async getCatalog(): Promise<LibraryCatalog> {
    try {
      const response = await this.fetchImpl(LIBRARY_INDEX_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!response.ok) {
        throw new Error(`Library index request failed with status ${response.status}`);
      }
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_INDEX_BYTES) {
        throw new Error(`Library index exceeds ${MAX_INDEX_BYTES} bytes`);
      }
      const entries = sanitizeEntries(JSON.parse(text));
      const fetchedAtMs = Date.now();
      this.writeCache({ entries, fetchedAtMs });
      return { entries, fetchedAtMs, fromCache: false };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const cached = this.readCache();
      if (cached) {
        return { entries: cached.entries, fetchedAtMs: cached.fetchedAtMs, fromCache: true, error };
      }
      return { entries: [], fetchedAtMs: 0, fromCache: false, error };
    }
  }

  async fetchProfile(entry: LibraryEntry): Promise<unknown> {
    if (typeof entry.file !== 'string' || !FILE_NAME_PATTERN.test(entry.file)) {
      throw new Error(`Invalid profile file name: ${entry.file}`);
    }
    const url = LIBRARY_INDEX_URL.replace('index.json', entry.file);
    if (!url.startsWith('https://')) {
      throw new Error('Library profiles must be fetched over HTTPS');
    }
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`Profile request failed with status ${response.status}`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_PROFILE_FILE_BYTES) {
      throw new Error(`Profile file exceeds ${MAX_PROFILE_FILE_BYTES} bytes`);
    }
    return JSON.parse(text);
  }

  private writeCache(cache: CachedCatalog): void {
    try {
      writeFileSync(this.cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
    } catch {
      // Cache is best-effort; ignore write failures.
    }
  }

  private readCache(): CachedCatalog | null {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.cachePath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) return null;
      const candidate = parsed as Partial<CachedCatalog>;
      if (!Array.isArray(candidate.entries)) return null;
      return {
        entries: candidate.entries.filter(isValidEntry),
        fetchedAtMs: typeof candidate.fetchedAtMs === 'number' ? candidate.fetchedAtMs : 0
      };
    } catch {
      return null;
    }
  }
}
