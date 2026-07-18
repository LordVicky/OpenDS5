import { spawn, type ChildProcess } from 'node:child_process';

export interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

export interface ProcessRunner {
  run(executable: string, args: readonly string[], timeoutMs?: number): Promise<ProcessResult>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_KILL_GRACE_PERIOD_MS = 250;

interface ProcessRunnerOptions {
  spawn?: (executable: string, args: string[], options: { shell: false; stdio: 'ignore' }) => ChildProcess;
  killGracePeriodMs?: number;
}

export function createProcessRunner(options: ProcessRunnerOptions = {}): ProcessRunner {
  const spawnProcess = options.spawn ?? spawn;
  const killGracePeriodMs = options.killGracePeriodMs ?? DEFAULT_KILL_GRACE_PERIOD_MS;

  return {
    run(executable, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
      return new Promise((resolve, reject) => {
        const child = spawnProcess(executable, [...args], { shell: false, stdio: 'ignore' });
        let settled = false;
        let timedOut = false;
        let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = (result: Omit<ProcessResult, 'timedOut'>): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
          resolve({ ...result, timedOut });
        };
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          forceKillTimer = setTimeout(() => {
            if (settled) return;
            child.kill('SIGKILL');
            finish({ code: null, signal: 'SIGKILL' });
          }, killGracePeriodMs);
        }, timeoutMs);
        child.once('error', (error) => {
          clearTimeout(timer);
          if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
        child.once('exit', (code, signal) => {
          finish({ code, signal });
        });
      });
    }
  };
}
