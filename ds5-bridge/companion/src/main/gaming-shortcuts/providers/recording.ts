import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RecordingProvider } from '../../../shared/gaming-shortcuts';

export interface RecordingProviderOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  hasExecutable?: (executable: string) => boolean;
  spawn?: (executable: string, args: string[]) => ChildProcess;
}

function defaultHasExecutable(executable: string): boolean {
  try {
    execFileSync('which', [executable], { stdio: 'ignore', timeout: 750 });
    return true;
  } catch {
    return false;
  }
}

function videosDirectory(env: NodeJS.ProcessEnv): string {
  return path.join(env.HOME || os.homedir(), 'Videos');
}

function filename(now: Date): string {
  return `OpenDS5-${now.toISOString().replace(/[:.]/g, '-')}.mp4`;
}

/** Owns the recorder process so stopping a shortcut cannot affect another recorder. */
export class GpuScreenRecorderProvider {
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;
  private readonly hasExecutable: (executable: string) => boolean;
  private readonly spawnProcess: (executable: string, args: string[]) => ChildProcess;
  private process: ChildProcess | null = null;

  constructor(options: RecordingProviderOptions = {}) {
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
    this.hasExecutable = options.hasExecutable ?? defaultHasExecutable;
    this.spawnProcess = options.spawn ?? ((executable, args) => spawn(executable, args, { shell: false, stdio: 'ignore' }));
  }

  async toggle(provider: RecordingProvider): Promise<{ ok: true } | { ok: false; reason: 'unavailable' | 'failed'; error?: string }> {
    if (provider !== 'auto' && provider !== 'gpu-screen-recorder') return { ok: false, reason: 'unavailable' };
    if (this.process) {
      this.process.kill('SIGINT');
      this.process = null;
      return { ok: true };
    }
    if (!this.hasExecutable('gpu-screen-recorder')) return { ok: false, reason: 'unavailable' };
    const outputDirectory = videosDirectory(this.env);
    fs.mkdirSync(outputDirectory, { recursive: true });
    const child = this.spawnProcess('gpu-screen-recorder', ['-w', 'portal', '-f', '60', '-o', path.join(outputDirectory, filename(this.now()))]);
    this.process = child;
    child.once('exit', () => {
      if (this.process === child) this.process = null;
    });
    child.once('error', () => {
      if (this.process === child) this.process = null;
    });
    return { ok: true };
  }
}
