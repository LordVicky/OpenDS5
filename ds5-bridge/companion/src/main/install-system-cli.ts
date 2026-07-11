import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function shouldRunSystemInstall(argv: string[]): boolean {
  return argv.includes('--install-system');
}

export function resolveInstallerPath(resourcesPath: string): string {
  return path.join(resourcesPath, 'installer', 'opends5-install');
}

/** Runs the bundled installer attached to the current terminal; returns its exit code. */
export function runSystemInstall(resourcesPath: string, extraArgs: string[] = []): number {
  const result = spawnSync('bash', [resolveInstallerPath(resourcesPath), ...extraArgs], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
}
