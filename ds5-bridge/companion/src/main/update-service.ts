import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  appImagePath,
  canSelfReplace,
  downloadTo,
  parseSha256Asset,
  sha256File,
  swapInPlace,
  tempDownloadPath,
} from './appimage-updater';
import { moduleSourceHash } from './module-source-hash';
import { decideUpdate, type UpdateDecision } from './update-checker';
import { fetchLatestRelease } from './update-source';
import type { SetupService } from './setup-service';

export const UPDATE_CHECK_INTERVAL_MS = 48 * 60 * 60 * 1000;

export type RebuildOutcome =
  | { kind: 'not-needed' }
  | { kind: 'adopt'; hash: string }
  | { kind: 'rebuild'; hash: string };

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'offer'; version: string; currentVersion: string; notes: string; sizeBytes: number }
  | { phase: 'notify'; version: string; url: string }
  | { phase: 'downloading'; version: string; received: number; total: number }
  | { phase: 'verifying'; version: string }
  | { phase: 'installing'; version: string; step: string; index: number; total: number }
  | { phase: 'restart'; version: string }
  | { phase: 'failed'; version: string; message: string; retry: 'download' | 'rebuild' }
  | { phase: 'readonly'; version: string; url: string };

/** A stored timestamp in the future means the clock moved back; check again. */
export function isCheckDue(lastCheckAt: number, now: number): boolean {
  if (lastCheckAt <= 0) return true;
  if (lastCheckAt > now) return true;
  return now - lastCheckAt >= UPDATE_CHECK_INTERVAL_MS;
}

/** NixOS updates are managed declaratively, so the AppImage updater must stay read-only. */
export function isNixOS(readFile: (file: string) => string = (file) => fs.readFileSync(file, 'utf8')): boolean {
  if (process.platform !== 'linux') return false;
  try {
    return /^ID=(?:"|')?nixos(?:"|')?\s*$/im.test(readFile('/etc/os-release'));
  } catch {
    return false;
  }
}

function runCommand(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout;
}

/**
 * The DKMS module version is stamped from package.json, so it is the app version.
 * Null means no module is installed — skip the installer rather than prompting
 * a user-mode-only install for a password.
 */
export function installedModuleVersion(run = runCommand): string | null {
  const out = run('modinfo', ['-F', 'version', 'vds_hcd']);
  const version = out?.trim() ?? '';
  return version.length > 0 ? version : null;
}

/**
 * The rebuild gate. Gating on the app version would prompt for a password on every
 * release, because dkms.conf is stamped from package.json; gate on the sources.
 */
export function decideRebuild(input: {
  bundledHash: string;
  recordedHash: string;
  installedVersion: string | null;
  appVersion: string;
}): RebuildOutcome {
  const { bundledHash, recordedHash, installedVersion, appVersion } = input;

  // No driver installed: never hand this user a password prompt.
  if (installedVersion === null) return { kind: 'not-needed' };
  if (!bundledHash) return { kind: 'not-needed' };
  if (recordedHash === bundledHash) return { kind: 'not-needed' };

  // Existing users upgrading into the first release with this feature have no
  // recorded hash. Fall back to the version comparison once, then adopt.
  if (recordedHash === '') {
    return installedVersion === appVersion
      ? { kind: 'adopt', hash: bundledHash }
      : { kind: 'rebuild', hash: bundledHash };
  }

  return { kind: 'rebuild', hash: bundledHash };
}

export type UpdateServiceDeps = {
  appImagePath: typeof appImagePath;
  canSelfReplace: typeof canSelfReplace;
  fetchLatestRelease: typeof fetchLatestRelease;
  downloadTo: typeof downloadTo;
  sha256File: typeof sha256File;
  swapInPlace: typeof swapInPlace;
  moduleSourceHash: (root: string) => string;
  installedModuleVersion: () => string | null;
  fetchText: (url: string) => Promise<string>;
  moduleSourceRoot: () => string;
  isNixOS: () => boolean;
};

const DEFAULT_DEPS: UpdateServiceDeps = {
  appImagePath,
  canSelfReplace,
  fetchLatestRelease,
  downloadTo,
  sha256File,
  swapInPlace,
  moduleSourceHash,
  installedModuleVersion,
  // The checksum asset is 64 bytes; a total deadline is right for it (unlike the
  // AppImage itself, which uses an inactivity timeout — see downloadTo).
  fetchText: async (url) => (await fetch(url, { signal: AbortSignal.timeout(15_000) })).text(),
  // resourcesPath only exists inside Electron; outside it (tests, plain node) there is
  // no bundled module. Return '' rather than a cwd-relative 'vds-module', which a stray
  // directory of that name would turn into a live rebuild gate.
  moduleSourceRoot: () => (process.resourcesPath ? path.join(process.resourcesPath, 'vds-module') : ''),
  isNixOS,
};

export class UpdateService {
  private state: UpdateState = { phase: 'idle' };
  private pending: Extract<UpdateDecision, { kind: 'offer' }> | null = null;
  private readonly deps: UpdateServiceDeps;

  constructor(
    private readonly currentVersion: string,
    private readonly setupService: SetupService,
    private readonly emit: (state: UpdateState) => void,
    deps: Partial<UpdateServiceDeps> = {},
  ) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
  }

  getState(): UpdateState {
    return this.state;
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.emit(state);
  }

  /**
   * Returns the state the toast should render, or idle for "show nothing".
   * Callers persist lastUpdateCheckAt regardless of the outcome, so a failed
   * check does not retry on every launch.
   */
  async check(skippedVersions: readonly string[]): Promise<UpdateState> {
    const target = this.deps.appImagePath();
    const nixos = this.deps.isNixOS();
    if (!target && !nixos) {
      this.set({ phase: 'idle' });
      return this.state;
    }

    const release = await this.deps.fetchLatestRelease();
    const decision = decideUpdate({
      release,
      currentVersion: this.currentVersion,
      skippedVersions,
    });
    if (decision.kind === 'none') {
      this.pending = null;
      this.set({ phase: 'idle' });
      return this.state;
    }

    this.pending = decision;

    if (nixos) {
      this.set({ phase: 'notify', version: decision.version, url: decision.appImage.url });
      return this.state;
    }

    // NixOS can notify without an AppImage path; all other update modes require one.
    if (!target) {
      this.pending = null;
      this.set({ phase: 'idle' });
      return this.state;
    }

    if (!this.deps.canSelfReplace(target)) {
      this.set({ phase: 'readonly', version: decision.version, url: decision.appImage.url });
      return this.state;
    }

    this.set({
      phase: 'offer',
      version: decision.version,
      currentVersion: this.currentVersion,
      notes: decision.notes,
      sizeBytes: decision.appImage.size,
    });
    return this.state;
  }

  /**
   * Download -> verify -> swap -> ready to restart.
   *
   * The driver rebuild deliberately does NOT happen here. Until the relaunch we are
   * still running from the old AppImage's FUSE mount, so process.resourcesPath and
   * app.getVersion() both describe the OLD release: rebuilding now would install the
   * old module from the old sources. See rebuildIfNeeded(), called on the next launch.
   */
  async start(): Promise<void> {
    if (this.deps.isNixOS()) return;
    const decision = this.pending;
    const target = this.deps.appImagePath();
    if (!decision || !target) return;
    const { version } = decision;

    const tempPath = tempDownloadPath(target);

    try {
      this.set({ phase: 'downloading', version, received: 0, total: decision.appImage.size });
      await this.deps.downloadTo({
        url: decision.appImage.url,
        tempPath,
        onProgress: (received, total) =>
          this.set({ phase: 'downloading', version, received, total }),
      });

      this.set({ phase: 'verifying', version });
      const expected = parseSha256Asset(await this.deps.fetchText(decision.sha256.url));
      const actual = await this.deps.sha256File(tempPath);
      if (!expected || expected !== actual) {
        await fs.promises.rm(tempPath, { force: true });
        this.set({
          phase: 'failed',
          version,
          message: "The download didn't verify.",
          retry: 'download',
        });
        return;
      }
    } catch {
      await fs.promises.rm(tempPath, { force: true });
      this.set({
        phase: 'failed',
        version,
        message: 'The download was interrupted.',
        retry: 'download',
      });
      return;
    }

    try {
      this.deps.swapInPlace(tempPath, target);
    } catch {
      // ENOSPC at rename, or the directory turned read-only since the writability
      // probe: the bytes arrived fine, so do not blame the download.
      await fs.promises.rm(tempPath, { force: true });
      this.set({
        phase: 'failed',
        version,
        message: "OpenDS5 downloaded the update but couldn't install it.",
        retry: 'download',
      });
      return;
    }

    this.set({ phase: 'restart', version });
  }

  /**
   * A hard kill mid-download leaves a ~100MB hidden sibling of the AppImage. The next
   * download truncates it, but it should not linger. Called on launch; must never throw
   * into the launch path.
   */
  cleanStaleDownload(): void {
    try {
      const target = this.deps.appImagePath();
      if (!target) return;
      fs.rmSync(tempDownloadPath(target), { force: true });
    } catch {
      /* a leftover temp file is not worth failing a launch over */
    }
  }

  /**
   * Called on launch, before the update check, from the NEW AppImage.
   *
   * Resolves the hash to record in settings, or null if nothing should be recorded
   * (nothing to do, or the rebuild failed — in which case the next launch retries).
   */
  async rebuildIfNeeded(recordedHash: string): Promise<string | null> {
    if (this.deps.isNixOS()) return null;
    const outcome = decideRebuild({
      bundledHash: this.deps.moduleSourceHash(this.deps.moduleSourceRoot()),
      recordedHash,
      installedVersion: this.deps.installedModuleVersion(),
      appVersion: this.currentVersion,
    });

    if (outcome.kind === 'not-needed') return null;
    if (outcome.kind === 'adopt') return outcome.hash;

    const version = this.currentVersion;
    this.set({ phase: 'installing', version, step: 'Preparing…', index: 0, total: 1 });

    let steps: string[] = [];
    const exit = await this.setupService.install((event) => {
      if (event.event === 'plan') steps = event.steps;
      if (event.event === 'step' && event.status === 'start') {
        this.set({
          phase: 'installing',
          version,
          step: steps[event.index] ?? 'Working…',
          index: event.index,
          total: steps.length || 1,
        });
      }
    });

    if (exit !== 0) {
      this.set({
        phase: 'failed',
        version,
        message: "OpenDS5 updated, but the controller driver didn't rebuild.",
        retry: 'rebuild',
      });
      return null;
    }

    this.set({ phase: 'idle' });
    return outcome.hash;
  }
}
