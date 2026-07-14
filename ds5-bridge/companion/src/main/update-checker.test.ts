import { describe, expect, it } from 'vitest';
import { compareVersions, decideUpdate, type Release } from './update-checker';

function release(overrides: Partial<Release> = {}): Release {
  return {
    version: '1.8.0',
    notes: 'Trigger effect import',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'OpenDS5-Companion-Setup-1.8.0.AppImage', url: 'https://x/a', size: 118 },
      { name: 'OpenDS5-Companion-Setup-1.8.0.AppImage.sha256', url: 'https://x/s', size: 64 },
    ],
    ...overrides,
  };
}

const base = { currentVersion: '1.7.0', skippedVersions: [] as string[] };

describe('compareVersions', () => {
  it('orders by numeric precedence, not string order', () => {
    // The case a string compare gets wrong: "1.10.0" < "1.9.0" lexically.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.7.0', '1.7.0')).toBe(0);
    expect(compareVersions('1.6.3', '1.7.0')).toBeLessThan(0);
  });

  it('ranks a prerelease below its own release', () => {
    expect(compareVersions('1.8.0-beta.1', '1.8.0')).toBeLessThan(0);
  });
});

describe('decideUpdate', () => {
  it('offers a newer stable release', () => {
    const decision = decideUpdate({ ...base, release: release() });
    expect(decision.kind).toBe('offer');
    if (decision.kind !== 'offer') throw new Error('expected an offer');
    expect(decision.version).toBe('1.8.0');
    expect(decision.appImage.url).toBe('https://x/a');
    expect(decision.sha256.url).toBe('https://x/s');
  });

  it('does not offer the version already running', () => {
    expect(decideUpdate({ ...base, release: release({ version: '1.7.0' }) }).kind).toBe('none');
  });

  it('does not offer an older release', () => {
    expect(decideUpdate({ ...base, release: release({ version: '1.6.3' }) }).kind).toBe('none');
  });

  it('never offers a prerelease or a draft', () => {
    expect(decideUpdate({ ...base, release: release({ prerelease: true }) }).kind).toBe('none');
    expect(decideUpdate({ ...base, release: release({ draft: true }) }).kind).toBe('none');
  });

  it('does not offer a skipped version but still offers its successor', () => {
    const skipped = { ...base, skippedVersions: ['1.8.0'] };
    expect(decideUpdate({ ...skipped, release: release() }).kind).toBe('none');
    expect(decideUpdate({ ...skipped, release: release({ version: '1.8.1' }) }).kind).toBe('offer');
  });

  it('does not offer a release with no AppImage or no checksum', () => {
    const noAppImage = release({ assets: [{ name: 'x.sha256', url: 'u', size: 1 }] });
    const noSum = release({ assets: [{ name: 'x.AppImage', url: 'u', size: 1 }] });
    expect(decideUpdate({ ...base, release: noAppImage }).kind).toBe('none');
    expect(decideUpdate({ ...base, release: noSum }).kind).toBe('none');
  });

  it('handles a missing release', () => {
    expect(decideUpdate({ ...base, release: null }).kind).toBe('none');
  });
});
