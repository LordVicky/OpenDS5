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

  it('never runs the installer before the relaunch', async () => {
    // Pre-relaunch, resourcesPath and app.getVersion() still describe the OLD
    // AppImage, so a rebuild here would build the old module from old sources.
    const { svc, setup } = service();
    await svc.start();
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
});
