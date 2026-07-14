import { describe, expect, it, vi } from 'vitest';
import { fetchLatestRelease, parseRelease } from './update-source';

const payload = {
  tag_name: 'v1.8.0',
  body: 'Trigger effect import',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'OpenDS5-Companion-Setup-1.8.0.AppImage',
      browser_download_url: 'https://x/a',
      size: 118,
    },
  ],
};

describe('parseRelease', () => {
  it('strips the leading v from the tag', () => {
    expect(parseRelease(payload)?.version).toBe('1.8.0');
  });

  it('keeps asset names, urls and sizes', () => {
    expect(parseRelease(payload)?.assets[0]).toEqual({
      name: 'OpenDS5-Companion-Setup-1.8.0.AppImage',
      url: 'https://x/a',
      size: 118,
    });
  });

  it('returns null rather than throwing on a malformed payload', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({})).toBeNull();
    expect(parseRelease({ tag_name: 'v1.8.0' })).toBeNull();
    expect(parseRelease({ tag_name: 42, assets: [] })).toBeNull();
  });

  it('ignores assets that are missing a name or a url', () => {
    const partial = { ...payload, assets: [{ name: 'a.AppImage' }, ...payload.assets] };
    expect(parseRelease(partial)?.assets).toHaveLength(1);
  });
});

describe('fetchLatestRelease', () => {
  it('parses a successful response', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    await expect(fetchLatestRelease(fake as unknown as typeof fetch)).resolves.toMatchObject({
      version: '1.8.0',
    });
  });

  it('resolves null on a non-200 response', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(fetchLatestRelease(fake as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('resolves null when the network is down, and does not reject', async () => {
    const fake = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    await expect(fetchLatestRelease(fake as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('resolves null when json() throws despite ok response', async () => {
    const fake = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    });
    await expect(fetchLatestRelease(fake as unknown as typeof fetch)).resolves.toBeNull();
  });
});
