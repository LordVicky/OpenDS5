import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function shouldRunSystemInstall(argv: string[]): boolean {
  return argv.includes('--install-system');
}

export function resolveInstallerPath(resourcesPath: string): string {
  return path.join(resourcesPath, 'installer', 'opends5-install');
}

/** Runs the bundled installer attached to the current terminal; returns its exit code. */
export function runSystemInstall(
  resourcesPath: string,
  appVersion: string,
  extraArgs: string[] = [],
): number {
  const result = spawnSync('bash', [resolveInstallerPath(resourcesPath), ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env, OPENDS5_MODULE_VERSION: appVersion },
  });
  return result.status ?? 1;
}
