import { execFileSync } from 'node:child_process';
import type { GamingShortcutAction } from '../../../shared/gaming-shortcuts';

export interface ResolvedLinuxAction {
  executable: string;
  args: string[];
}

export interface LinuxActionProviderOptions {
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

/** Resolves only fixed, argument-array Linux actions; it never invokes a shell. */
export class LinuxActionProvider {
  private readonly hasExecutable: (executable: string) => boolean;

  constructor(options: LinuxActionProviderOptions = {}) {
    this.hasExecutable = options.hasExecutable ?? defaultHasExecutable;
  }

  resolve(action: GamingShortcutAction): ResolvedLinuxAction | null {
    switch (action.type) {
      case 'volume':
        if (!this.hasExecutable('wpctl')) return null;
        if (action.direction === 'mute') return { executable: 'wpctl', args: ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle'] };
        return {
          executable: 'wpctl',
          args: ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', action.direction === 'up' ? '5%+' : '5%-']
        };
      case 'microphone-mute-toggle':
        return this.hasExecutable('wpctl')
          ? { executable: 'wpctl', args: ['set-mute', '@DEFAULT_AUDIO_SOURCE@', 'toggle'] }
          : null;
      case 'on-screen-keyboard': {
        const providers = action.provider === 'auto' ? ['wvkbd', 'onboard', 'squeekboard'] : [action.provider];
        const executable = providers.find((candidate) => this.hasExecutable(candidate));
        return executable ? { executable, args: [] } : null;
      }
      case 'performance-hud-toggle':
        // MangoHud handles the toggle in the game; send its default hotkey to
        // the focused application rather than launching mangohud again.
        return this.hasExecutable('wtype') ? { executable: 'wtype', args: ['-k', 'F12'] } : null;
      default:
        return null;
    }
  }
}
