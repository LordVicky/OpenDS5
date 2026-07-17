export type DesktopEnvironment =
  | 'hyprland'
  | 'sway'
  | 'kde'
  | 'gnome'
  | 'gamescope'
  | 'wayland'
  | 'x11'
  | 'unknown';

export interface EnvironmentProbe {
  env?: NodeJS.ProcessEnv;
  hasExecutable?: (executable: string) => boolean;
}

export interface ProviderCapabilities {
  environment: DesktopEnvironment;
  screenshot: string[];
  recording: string[];
  hud: string[];
  keyboard: string[];
}

function defaultHasExecutable(executable: string): boolean {
  try {
    execFileSync('which', [executable], { stdio: 'ignore', timeout: 750 });
    return true;
  } catch {
    return false;
  }
}

function desktopValue(env: NodeJS.ProcessEnv): string {
  return `${env.XDG_CURRENT_DESKTOP ?? ''}:${env.XDG_SESSION_DESKTOP ?? ''}`.toLowerCase();
}

/** Detects only environment facts; command availability is injected for tests. */
export function detectDesktopEnvironment({ env = process.env }: EnvironmentProbe = {}): DesktopEnvironment {
  if (env.GAMESCOPE_WAYLAND_DISPLAY) return 'gamescope';
  if (env.HYPRLAND_INSTANCE_SIGNATURE) return 'hyprland';
  if (env.SWAYSOCK) return 'sway';

  const desktop = desktopValue(env);
  if (desktop.includes('hyprland')) return 'hyprland';
  if (desktop.includes('sway')) return 'sway';
  if (desktop.includes('kde') || desktop.includes('plasma')) return 'kde';
  if (desktop.includes('gnome')) return 'gnome';
  if (env.WAYLAND_DISPLAY) return 'wayland';
  if (env.DISPLAY) return 'x11';
  return 'unknown';
}

export function detectProviderCapabilities(options: EnvironmentProbe = {}): ProviderCapabilities {
  const env = options.env ?? process.env;
  const hasExecutable = options.hasExecutable ?? defaultHasExecutable;
  const environment = detectDesktopEnvironment({ env, hasExecutable });

  const screenshot: string[] = [];
  if (environment === 'hyprland' && hasExecutable('hyprshot')) screenshot.push('hyprshot');
  if (hasExecutable('grim')) screenshot.push('grim');
  if (hasExecutable('gnome-screenshot')) screenshot.push('gnome-screenshot');
  if (hasExecutable('spectacle')) screenshot.push('spectacle');
  if (hasExecutable('scrot')) screenshot.push('scrot');

  const recording: string[] = [];
  if (hasExecutable('gpu-screen-recorder')) recording.push('gpu-screen-recorder');

  const hud: string[] = [];
  if (hasExecutable('mangohud')) hud.push('mangohud');
  const keyboard: string[] = [];
  for (const provider of ['wvkbd', 'onboard', 'squeekboard']) if (hasExecutable(provider)) keyboard.push(provider);
  return { environment, screenshot, recording, hud, keyboard };
}
import { execFileSync } from 'node:child_process';
