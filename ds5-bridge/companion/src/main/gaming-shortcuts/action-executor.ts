import { validateGamingShortcutAction, type GamingShortcutAction } from '../../shared/gaming-shortcuts';
import { createProcessRunner, type ProcessRunner } from './process-runner';

export type ActionExecutionResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'failed'; error?: string };

export interface ActionExecutorOptions {
  runner?: ProcessRunner;
  openOpenDS5?: () => Promise<void> | void;
}

/** Executes only validated actions; desktop-specific actions are provider work. */
export class ActionExecutor {
  private readonly runner: ProcessRunner;
  private readonly openOpenDS5: (() => Promise<void> | void) | null;

  constructor(options: ActionExecutorOptions = {}) {
    this.runner = options.runner ?? createProcessRunner();
    this.openOpenDS5 = options.openOpenDS5 ?? null;
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
        default:
          return { ok: false, reason: 'unavailable' };
      }
    } catch (error) {
      return { ok: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }
}
