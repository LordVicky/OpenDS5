import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UpdateService,
  decideRebuild,
  installedModuleVersion,
  isCheckDue,
  isNixOS,
  type UpdateState,
} from './update-service';
import type { SetupService } from './setup-service';

describe('isCheckDue', () => {
  const now = 1_000_000_000_000;

  it('checks when it has never checked', () => {
    expect(isCheckDue(0, now)).toBe(true);
  });

  it('does not check again inside the two-day window', () => {
    expect(isCheckDue(now - 1000, now)).toBe(false);
    expect(isCheckDue(now - (UPDATE_CHECK_INTERVAL_MS - 1), now)).toBe(false);
  });

  it('checks once the window has passed', () => {
    expect(isCheckDue(now - UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it('checks when the stored timestamp is in the future (clock moved back)', () => {
    expect(isCheckDue(now + 5000, now)).toBe(true);
  });
});

describe('isNixOS', () => {
  it('recognizes an os-release file with ID=nixos', () => {
    expect(isNixOS(() => 'NAME="NixOS"\nID=nixos\n')).toBe(true);
  });

  it('does not treat another Linux distribution as NixOS', () => {
    expect(isNixOS(() => 'NAME="Debian GNU/Linux"\nID=debian\n')).toBe(false);
  });
});

describe('installedModuleVersion', () => {
  it('reads the version modinfo reports', () => {
    const run = vi.fn().mockReturnValue('1.7.0-beta.1\n');
    expect(installedModuleVersion(run)).toBe('1.7.0-beta.1');
    expect(run).toHaveBeenCalledWith('modinfo', ['-F', 'version', 'vds_hcd']);
  });

  it('reports no module when modinfo fails', () => {
    expect(installedModuleVersion(() => null)).toBeNull();
  });

  it('reports no module when modinfo prints nothing', () => {
    expect(installedModuleVersion(() => '  \n')).toBeNull();
  });
});

describe('decideRebuild', () => {
  const app = '1.8.0';

  it('asks for nothing when the driver sources did not change', () => {
    // The whole point of the hash gate: a UI-only release needs no password.
    expect(
      decideRebuild({
        bundledHash: 'aaa',
        recordedHash: 'aaa',
        installedVersion: '1.7.0',
        appVersion: app,
      }),
    ).toEqual({ kind: 'not-needed' });
  });

  it('rebuilds when the driver sources changed', () => {
    expect(
      decideRebuild({
        bundledHash: 'bbb',
        recordedHash: 'aaa',
        installedVersion: '1.7.0',
        appVersion: app,
      }),
    ).toEqual({ kind: 'rebuild', hash: 'bbb' });
  });

  it('never touches the installer when no module is installed', () => {
    // Someone who never installed the driver must not be handed a password prompt.
    expect(
      decideRebuild({
        bundledHash: 'bbb',
        recordedHash: '',
        installedVersion: null,
        appVersion: app,
      }),
    ).toEqual({ kind: 'not-needed' });
  });

  it('falls back to the version for an existing user with no recorded hash', () => {
    expect(
      decideRebuild({
        bundledHash: 'bbb',
        recordedHash: '',
        installedVersion: '1.7.0',
        appVersion: app,
      }),
    ).toEqual({ kind: 'rebuild', hash: 'bbb' });
  });

  it('adopts the hash without rebuilding when the module already matches the app', () => {
    expect(
      decideRebuild({
        bundledHash: 'bbb',
        recordedHash: '',
        installedVersion: '1.8.0',
        appVersion: app,
      }),
    ).toEqual({ kind: 'adopt', hash: 'bbb' });
  });
});

describe('UpdateService.start', () => {
  let dir: string;
  let target: string;
  let states: UpdateState[];

  const NEW_BYTES = 'new-appimage-bytes';
  const digest = createHash('sha256').update(NEW_BYTES).digest('hex');

  const decision = {
    kind: 'offer' as const,
    version: '1.8.0',
    notes: '',
    appImage: { name: 'x.AppImage', url: 'https://x/a', size: NEW_BYTES.length },
    sha256: { name: 'x.AppImage.sha256', url: 'https://x/s', size: 64 },
  };

  function service(overrides: Record<string, unknown> = {}) {
    states = [];
    const setup = { install: vi.fn().mockResolvedValue(0) } as unknown as SetupService;
    const svc = new UpdateService('1.7.0', setup, (s) => states.push(s), {
      appImagePath: () => target,
      canSelfReplace: () => true,
      isNixOS: () => false,
      fetchLatestRelease: vi.fn(),
      fetchText: vi.fn().mockResolvedValue(`${digest}  x.AppImage`),
      downloadTo: vi.fn(async ({ tempPath }: { tempPath: string }) => {
        fs.writeFileSync(tempPath, NEW_BYTES);
      }),
      ...overrides,
    });
    // The offer normally comes from check(); inject it directly.
    (svc as unknown as { pending: unknown }).pending = decision;
    return { svc, setup };
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opends5-svc-'));
    target = path.join(dir, 'OpenDS5.AppImage');
    fs.writeFileSync(target, 'old-appimage-bytes');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('downloads, verifies, swaps, and stops at restart', async () => {
    const { svc, setup } = service();
    await svc.start();

    expect(fs.readFileSync(target, 'utf8')).toBe(NEW_BYTES);
    expect(svc.getState()).toEqual({ phase: 'restart', version: '1.8.0' });
    expect(states.map((s) => s.phase)).toEqual([
      'downloading',
      'verifying',
      'restart',
    ]);
  });

  it('never consults the rebuild decision before the relaunch', async () => {
    // Pre-relaunch, resourcesPath and app.getVersion() still describe the OLD
    // AppImage, so a rebuild here would build the old module from old sources.
    // Asserting the inputs to decideRebuild are never even read is what makes this
    // fail if rebuildIfNeeded() is moved back into start(): a hash/version override
    // alone could land on the 'adopt' path and skip the installer anyway.
    const moduleSourceHash = vi.fn().mockReturnValue('bbb');
    const installedModuleVersion = vi.fn().mockReturnValue('1.7.0');
    const { svc, setup } = service({ moduleSourceHash, installedModuleVersion });

    await svc.start();

    expect(moduleSourceHash).not.toHaveBeenCalled();
    expect(installedModuleVersion).not.toHaveBeenCalled();
    expect(setup.install).not.toHaveBeenCalled();
  });

  it('does not swap when the checksum does not match', async () => {
    const { svc } = service({ fetchText: vi.fn().mockResolvedValue('deadbeef  x.AppImage') });
    await svc.start();

    expect(fs.readFileSync(target, 'utf8')).toBe('old-appimage-bytes');
    expect(svc.getState().phase).toBe('failed');
    expect(fs.readdirSync(dir)).toEqual(['OpenDS5.AppImage']); // temp file cleaned up
  });

  it('leaves the installed version alone when the download fails', async () => {
    const { svc } = service({
      downloadTo: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
    });
    await svc.start();

    expect(fs.readFileSync(target, 'utf8')).toBe('old-appimage-bytes');
    expect(svc.getState().phase).toBe('failed');
    expect(svc.getState()).toMatchObject({
      message: 'The download was interrupted.',
      retry: 'download',
    });
  });

  it('does not blame the download when the swap itself fails', async () => {
    const { svc } = service({
      swapInPlace: vi.fn(() => {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }),
    });
    await svc.start();

    expect(fs.readFileSync(target, 'utf8')).toBe('old-appimage-bytes');
    expect(svc.getState()).toEqual({
      phase: 'failed',
      version: '1.8.0',
      message: "OpenDS5 downloaded the update but couldn't install it.",
      retry: 'download',
    });
    expect(fs.readdirSync(dir)).toEqual(['OpenDS5.AppImage']); // temp file cleaned up
  });
});

describe('UpdateService.cleanStaleDownload', () => {
  let dir: string;

  function service(appImagePathImpl: () => string | null) {
    const setup = { install: vi.fn() } as unknown as SetupService;
    return new UpdateService('1.7.0', setup, () => {}, {
      appImagePath: appImagePathImpl,
      canSelfReplace: () => true,
      isNixOS: () => false,
      fetchLatestRelease: vi.fn(),
    });
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opends5-stale-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes a temp file orphaned by a hard kill mid-download', () => {
    const target = path.join(dir, 'OpenDS5.AppImage');
    fs.writeFileSync(target, 'installed');
    fs.writeFileSync(path.join(dir, '.OpenDS5.AppImage.download'), 'half a download');

    service(() => target).cleanStaleDownload();

    expect(fs.readdirSync(dir)).toEqual(['OpenDS5.AppImage']);
    expect(fs.readFileSync(target, 'utf8')).toBe('installed');
  });

  it('does nothing when there is no AppImage and never throws into the launch path', () => {
    expect(() => service(() => null).cleanStaleDownload()).not.toThrow();

    // A directory at the temp path makes rmSync throw EISDIR even with force:true.
    const target = path.join(dir, 'OpenDS5.AppImage');
    fs.mkdirSync(path.join(dir, '.OpenDS5.AppImage.download'));
    expect(() => service(() => target).cleanStaleDownload()).not.toThrow();
  });
});

describe('UpdateService.check', () => {
  const release = {
    version: '1.8.0',
    notes: 'notes',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'x.AppImage', url: 'https://x/a', size: 100 },
      { name: 'x.AppImage.sha256', url: 'https://x/s', size: 64 },
    ],
  };

  function service(overrides: Record<string, unknown> = {}) {
    const setup = { install: vi.fn() } as unknown as SetupService;
    const svc = new UpdateService('1.7.0', setup, () => {}, {
      appImagePath: () => '/x/OpenDS5.AppImage',
      canSelfReplace: () => true,
      isNixOS: () => false,
      fetchLatestRelease: vi.fn().mockResolvedValue(release),
      ...overrides,
    });
    return svc;
  }

  const pendingOf = (svc: UpdateService) =>
    (svc as unknown as { pending: unknown }).pending;

  it('offers a newer release', async () => {
    const svc = service();
    await expect(svc.check([])).resolves.toEqual({
      phase: 'offer',
      version: '1.8.0',
      currentVersion: '1.7.0',
      notes: 'notes',
      sizeBytes: 100,
    });
  });

  it('points a read-only install at the download page instead', async () => {
    const svc = service({ canSelfReplace: () => false });
    await expect(svc.check([])).resolves.toEqual({
      phase: 'readonly',
      version: '1.8.0',
      url: 'https://x/a',
    });
  });

  it('only notifies about updates on NixOS', async () => {
    const svc = service({ appImagePath: () => null, isNixOS: () => true });
    await expect(svc.check([])).resolves.toEqual({
      phase: 'notify',
      version: '1.8.0',
      url: 'https://x/a',
    });
  });

  it('stays idle when there is no AppImage to replace', async () => {
    const svc = service({ appImagePath: () => null });
    expect((await svc.check([])).phase).toBe('idle');
  });

  it('clears a previously offered version when a later check finds nothing', async () => {
    // A stale pending offer behind an idle state would let start() install a version
    // the user already skipped.
    const svc = service();
    await svc.check([]);
    expect(pendingOf(svc)).not.toBeNull();

    await svc.check(['1.8.0']);
    expect(svc.getState()).toEqual({ phase: 'idle' });
    expect(pendingOf(svc)).toBeNull();
  });
});

describe('UpdateService.rebuildIfNeeded', () => {
  function service(installExit: number) {
    const states: UpdateState[] = [];
    const setup = {
      install: vi.fn(async (onEvent: (e: unknown) => void) => {
        onEvent({ event: 'plan', total: 1, steps: ['Rebuilding the driver'], log: '' });
        onEvent({ event: 'step', index: 0, status: 'start' });
        return installExit;
      }),
    } as unknown as SetupService;
    const svc = new UpdateService('1.8.0', setup, (s) => states.push(s), {
      appImagePath: () => '/x/OpenDS5.AppImage',
      canSelfReplace: () => true,
      isNixOS: () => false,
      fetchLatestRelease: vi.fn(),
      moduleSourceHash: () => 'bbb',
      installedModuleVersion: () => '1.7.0',
    });
    return { svc, setup, states };
  }

  it('runs the installer and reports the new hash to record', async () => {
    const { svc, setup, states } = service(0);
    await expect(svc.rebuildIfNeeded('aaa')).resolves.toBe('bbb');
    expect(setup.install).toHaveBeenCalled();
    expect(states.some((s) => s.phase === 'installing')).toBe(true);
  });

  it('records nothing when the rebuild fails, so the next launch retries', async () => {
    const { svc } = service(1);
    await expect(svc.rebuildIfNeeded('aaa')).resolves.toBeNull();
    expect(svc.getState().phase).toBe('failed');
  });

  it('does nothing at all when the sources are unchanged', async () => {
    const { svc, setup } = service(0);
    await expect(svc.rebuildIfNeeded('bbb')).resolves.toBeNull();
    expect(setup.install).not.toHaveBeenCalled();
  });

  it('does not inspect sources or run the installer on NixOS', async () => {
    const { setup } = service(0);
    const moduleSourceHash = vi.fn().mockReturnValue('bbb');
    const installedModuleVersion = vi.fn().mockReturnValue('1.7.0');
    const nixosService = new UpdateService('1.8.0', setup, () => {}, {
      appImagePath: () => '/x/OpenDS5.AppImage',
      isNixOS: () => true,
      moduleSourceHash,
      installedModuleVersion,
    });

    await expect(nixosService.rebuildIfNeeded('aaa')).resolves.toBeNull();
    expect(moduleSourceHash).not.toHaveBeenCalled();
    expect(installedModuleVersion).not.toHaveBeenCalled();
    expect(setup.install).not.toHaveBeenCalled();
  });
});
