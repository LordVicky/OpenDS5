import type { Release, ReleaseAsset } from './update-checker';

export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/LordVicky/OpenDS5/releases/latest';

function parseAsset(value: unknown): ReleaseAsset | null {
  if (typeof value !== 'object' || value === null) return null;
  const asset = value as Record<string, unknown>;
  if (typeof asset.name !== 'string') return null;
  if (typeof asset.browser_download_url !== 'string') return null;
  return {
    name: asset.name,
    url: asset.browser_download_url,
    size: typeof asset.size === 'number' ? asset.size : 0,
  };
}

export function parseRelease(payload: unknown): Release | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (typeof body.tag_name !== 'string') return null;
  if (!Array.isArray(body.assets)) return null;

  return {
    version: body.tag_name.replace(/^v/, ''),
    notes: typeof body.body === 'string' ? body.body : '',
    draft: body.draft === true,
    prerelease: body.prerelease === true,
    assets: body.assets.map(parseAsset).filter((a): a is ReleaseAsset => a !== null),
  };
}

/** Resolves null on any failure; a background check must never throw into launch. */
export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<Release | null> {
  try {
    const response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return parseRelease(await response.json());
  } catch {
    return null;
  }
}
