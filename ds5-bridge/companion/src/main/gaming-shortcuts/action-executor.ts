import { validateGamingShortcutAction, type GamingShortcutAction } from '../../shared/gaming-shortcuts';
import { createProcessRunner, type ProcessRunner } from './process-runner';
import { LinuxActionProvider } from './providers/linux-actions';

export type ActionExecutionResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'failed'; error?: string };

export interface ActionExecutorOptions {
  runner?: ProcessRunner;
  openOpenDS5?: () => Promise<void> | void;
  linuxProvider?: LinuxActionProvider;
}

/** Executes only validated actions; desktop-specific actions are provider work. */
export class ActionExecutor {
  private readonly runner: ProcessRunner;
  private readonly openOpenDS5: (() => Promise<void> | void) | null;
  private readonly linuxProvider: LinuxActionProvider;

  constructor(options: ActionExecutorOptions = {}) {
    this.runner = options.runner ?? createProcessRunner();
    this.openOpenDS5 = options.openOpenDS5 ?? null;
    this.linuxProvider = options.linuxProvider ?? new LinuxActionProvider();
  }

  async execute(rawAction: unknown): Promise<ActionExecutionResult> {
    const action: GamingShortcutAction = validateGamingShortcutAction(rawAction);
    try {
      switch (action.type) {
        case 'none':
        case 'passthrough':
          return { ok: true };
        case 'open-opends5':
          if (!this.openOpenDS5) return { ok: false, reason: 'unavailable' };
          await this.openOpenDS5();
          return { ok: true };
        case 'launch-app':
        case 'custom-executable': {
          const result = await this.runner.run(action.executable, action.args);
          return result.code === 0 && result.signal === null && !result.timedOut
            ? { ok: true }
            : { ok: false, reason: 'failed', error: result.timedOut ? 'Process timed out' : `Process exited with code ${result.code ?? 'unknown'}` };
        }
        case 'volume':
        case 'microphone-mute-toggle': {
          const command = this.linuxProvider.resolve(action);
          if (!command) return { ok: false, reason: 'unavailable' };
          const result = await this.runner.run(command.executable, command.args);
          return result.code === 0 && result.signal === null && !result.timedOut
            ? { ok: true }
            : { ok: false, reason: 'failed', error: result.timedOut ? 'Process timed out' : `Process exited with ${result.code ?? 'unknown'}` };
        }
        default:
          return { ok: false, reason: 'unavailable' };
      }
    } catch (error) {
      return { ok: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }
}
