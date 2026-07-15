import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_PROFILE_FILE_BYTES } from './trigger-profile-store';

// The library lives in the public OpenDS5-Profiles repo, which is both where contributors open
// pull requests and what the app fetches: raw.githubusercontent.com only serves public repos
// anonymously, and this repo is private. That repo's CI validates each profile using this repo's
// validator, vendored there by scripts/sync-validator.mjs.
export const LIBRARY_INDEX_URL =
  'https://raw.githubusercontent.com/LordVicky/OpenDS5-Profiles/main/profiles/library/index.json';
// Games that drive the adaptive triggers themselves. Native support is a property of the
// game, not of a profile, so it lives in its own file rather than as a profile tier.
export const LIBRARY_NATIVE_URL =
  'https://raw.githubusercontent.com/LordVicky/OpenDS5-Profiles/main/profiles/library/native.json';
export const MAX_INDEX_BYTES = 1048576;

const FETCH_TIMEOUT_MS = 10000;
const CACHE_FILE = 'library-cache.json';
const FILE_NAME_PATTERN = /^[a-z0-9-]+\.json$/;

export type LibraryTier = 'verified' | 'community';

export interface LibraryOrigin {
  kind: 'port';
  from: string;
}

export interface LibraryEntry {
  file: string;
  name: string;
  game: string;
  author: string;
  description: string;
  // Derived from the profile by the profiles repo's CI, using this app's own
  // describeCapabilities, so the app can describe a profile without downloading it -- and so the
  // line cannot claim an effect the profile does not have.
  capabilities: string;
  tier: LibraryTier;
  origin?: LibraryOrigin;
}

export interface NativeGameFeatures {
  triggers: boolean;
  haptics: boolean;
  lightbar: boolean;
}

export interface NativeGame {
  game: string;
  /** Per-feature support from PCGamingWiki; absent in pre-annotation lists (treated as triggers-only). */
  features?: NativeGameFeatures;
}

export interface LibraryCatalog {
  entries: LibraryEntry[];
  nativeGames: NativeGame[];
  fetchedAtMs: number;
  fromCache: boolean;
  error?: string;
}

interface CachedCatalog {
  entries: LibraryEntry[];
  nativeGames: NativeGame[];
  fetchedAtMs: number;
}

function isValidEntry(value: unknown): value is Record<string, unknown> {
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

// An unlabelled or malformed tier is community: a profile must never present itself as
// maintainer-verified by omitting the field or getting it wrong.
function coerceTier(value: unknown): LibraryTier {
  return value === 'verified' ? 'verified' : 'community';
}

// A malformed origin is dropped rather than rejecting the entry, so one bad field never
// removes an otherwise-valid profile from the library.
function coerceOrigin(value: unknown): LibraryOrigin | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const origin = value as Record<string, unknown>;
  if (origin.kind !== 'port') return undefined;
  if (typeof origin.from !== 'string' || origin.from.length === 0) return undefined;
  return { kind: 'port', from: origin.from };
}

function sanitizeEntries(parsed: unknown): LibraryEntry[] {
  if (!Array.isArray(parsed)) {
    throw new Error('Library index is not an array');
  }
  return parsed.filter(isValidEntry).map((entry) => {
    const origin = coerceOrigin(entry.origin);
    return {
      file: entry.file as string,
      name: entry.name as string,
      game: entry.game as string,
      author: entry.author as string,
      description: entry.description as string,
      capabilities: typeof entry.capabilities === 'string' ? entry.capabilities : '',
      tier: coerceTier(entry.tier),
      ...(origin ? { origin } : {})
    };
  });
}

function sanitizeNativeGames(parsed: unknown): NativeGame[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (value): value is Record<string, unknown> =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>).game === 'string' &&
        ((value as Record<string, unknown>).game as string).length > 0
    )
    .map((value) => {
      const game: NativeGame = { game: value.game as string };
      const features = value.features;
      if (typeof features === 'object' && features !== null) {
        const f = features as Record<string, unknown>;
        game.features = {
          triggers: f.triggers === true,
          haptics: f.haptics === true,
          lightbar: f.lightbar === true
        };
      }
      return game;
    });
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
      const nativeGames = await this.fetchNativeGames();
      const fetchedAtMs = Date.now();
      this.writeCache({ entries, nativeGames, fetchedAtMs });
      return { entries, nativeGames, fetchedAtMs, fromCache: false };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const cached = this.readCache();
      if (cached) {
        return {
          entries: cached.entries,
          nativeGames: cached.nativeGames,
          fetchedAtMs: cached.fetchedAtMs,
          fromCache: true,
          error
        };
      }
      return { entries: [], nativeGames: [], fetchedAtMs: 0, fromCache: false, error };
    }
  }

  // The native list is supplementary: if it fails, native games simply lose their tag and
  // the rest of the library still works. It must never fail the catalog fetch.
  private async fetchNativeGames(): Promise<NativeGame[]> {
    try {
      const response = await this.fetchImpl(LIBRARY_NATIVE_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!response.ok) return [];
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_INDEX_BYTES) return [];
      return sanitizeNativeGames(JSON.parse(text));
    } catch {
      return [];
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
      const candidate = parsed as Record<string, unknown>;
      if (!Array.isArray(candidate.entries)) return null;
      // A cache written before native games existed has no nativeGames key; sanitize rather
      // than discard, so an upgraded app still has its offline catalog.
      return {
        entries: sanitizeEntries(candidate.entries),
        nativeGames: sanitizeNativeGames(candidate.nativeGames),
        fetchedAtMs: typeof candidate.fetchedAtMs === 'number' ? candidate.fetchedAtMs : 0
      };
    } catch {
      return null;
    }
  }
}
