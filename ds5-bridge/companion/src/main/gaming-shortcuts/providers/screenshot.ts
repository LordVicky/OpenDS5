import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CaptureProvider } from '../../../shared/gaming-shortcuts';

export interface ScreenshotCommand {
  executable: string;
  args: string[];
  outputPath: string;
}

export interface ScreenshotProviderOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  hasExecutable?: (executable: string) => boolean;
}

function defaultHasExecutable(executable: string): boolean {
  try {
    execFileSync('which', [executable], { stdio: 'ignore', timeout: 750 });
    return true;
  } catch {
    return false;
  }
}

function picturesDirectory(env: NodeJS.ProcessEnv): string {
  const configured = env.XDG_PICTURES_DIR;
  if (configured && path.isAbsolute(configured)) return configured;
  return path.join(env.HOME || os.homedir(), 'Pictures');
}

function filename(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `OpenDS5-${stamp}.png`;
}

/** Builds screenshot commands without invoking a shell or accepting raw command text. */
export class ScreenshotProvider {
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;
  private readonly hasExecutable: (executable: string) => boolean;

  constructor(options: ScreenshotProviderOptions = {}) {
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
    this.hasExecutable = options.hasExecutable ?? defaultHasExecutable;
  }

  resolve(provider: CaptureProvider): ScreenshotCommand | null {
    const selected = provider === 'auto' ? this.autoProvider() : provider;
    const outputPath = path.join(picturesDirectory(this.env), filename(this.now()));
    switch (selected) {
      case 'hyprshot': return {
        executable: 'hyprshot',
        args: ['-m', 'window', '-m', 'active', '-o', path.dirname(outputPath), '-f', path.basename(outputPath)],
        outputPath
      };
      case 'grim': return { executable: 'grim', args: [outputPath], outputPath };
      case 'gnome-screenshot': return { executable: 'gnome-screenshot', args: ['-f', outputPath], outputPath };
      case 'spectacle': return { executable: 'spectacle', args: ['-b', '-n', '-o', outputPath], outputPath };
      case 'scrot': return { executable: 'scrot', args: [outputPath], outputPath };
      default: return null;
    }
  }

  ensureOutputDirectory(command: ScreenshotCommand): void {
    fs.mkdirSync(path.dirname(command.outputPath), { recursive: true });
  }

  private autoProvider(): CaptureProvider | null {
    const wayland = Boolean(this.env.WAYLAND_DISPLAY || this.env.HYPRLAND_INSTANCE_SIGNATURE || this.env.SWAYSOCK);
    const candidates = this.env.HYPRLAND_INSTANCE_SIGNATURE
      ? ['hyprshot', 'grim', 'gnome-screenshot', 'spectacle', 'scrot']
      : wayland
      ? ['grim', 'gnome-screenshot', 'spectacle', 'scrot']
      : ['gnome-screenshot', 'spectacle', 'scrot', 'grim'];
    return candidates.find((candidate) => this.hasExecutable(candidate)) as CaptureProvider | undefined ?? null;
  }
}
