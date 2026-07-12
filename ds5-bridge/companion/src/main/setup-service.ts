import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

export type SetupProgressEvent =
  | { event: 'plan'; total: number; steps: string[]; log: string }
  | { event: 'step'; index: number; status: 'start' | 'ok' | 'fail'; exit?: number }
  | { event: 'done'; exit: number };

export function parseProgressLine(line: string): SetupProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (obj.event === 'plan' && Array.isArray(obj.steps)) return obj as unknown as SetupProgressEvent;
    if (obj.event === 'step' && typeof obj.index === 'number') return obj as unknown as SetupProgressEvent;
    if (obj.event === 'done' && typeof obj.exit === 'number') return obj as unknown as SetupProgressEvent;
    return null;
  } catch {
    return null;
  }
}

export function isSetupNeeded(opts?: {
  moduleSysfs?: string;
  serviceActive?: () => boolean;
}): boolean {
  const sysfs = opts?.moduleSysfs ?? '/sys/module/vds_hcd';
  const serviceActive =
    opts?.serviceActive ??
    (() => spawnSync('systemctl', ['is-active', '--quiet', 'vdsd.service']).status === 0);
  if (!fs.existsSync(sysfs)) return true;
  return !serviceActive();
}

export class SetupService {
  constructor(
    private readonly installerPath: string,
    private readonly appVersion: string,
  ) {}

  private env() {
    return { ...process.env, OPENDS5_MODULE_VERSION: this.appVersion };
  }

  dryRunPlan(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', [this.installerPath, '--dry-run', '--yes'], { env: this.env() });
      let out = '';
      let err = '';
      child.stdout.on('data', (d: Buffer) => (out += d));
      child.stderr.on('data', (d: Buffer) => (err += d));
      child.on('close', (code) =>
        code === 0 ? resolve(out) : reject(new Error(`dry-run failed (${code}): ${err}`)),
      );
    });
  }

  /**
   * Runs the installer unprivileged; it escalates itself once via pkexec.
   * Resolves with the installer's exit code; progress events stream to onEvent.
   */
  install(onEvent: (e: SetupProgressEvent) => void): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn('bash', [this.installerPath, '--yes', '--json-progress'], {
        env: this.env(),
      });
      let buffer = '';
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const event = parseProgressLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          if (event) onEvent(event);
        }
      });
      child.on('close', (code) => resolve(code ?? 1));
    });
  }
}
