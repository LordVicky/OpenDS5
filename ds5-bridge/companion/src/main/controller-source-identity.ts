import { realpathSync } from 'node:fs';
import path from 'node:path';

/** Returns the stable sysfs controller node shared by input and hidraw nodes. */
export function normalizeControllerSysfsPath(value: string): string | null {
  if (!value.startsWith('/')) return null;
  const normalized = value.replace(/\\/g, '/').replace(/\/+$|^\/+/, '');
  const withoutClassNode = normalized
    .replace(/\/input\/input\d+$/, '')
    .replace(/\/hidraw\/hidraw\d+$/, '');
  return withoutClassNode || null;
}

export function controllerSourceIdsMatch(evdevPath: string, hidPath: string): boolean {
  const evdevSourceId = normalizeControllerSysfsPath(evdevPath);
  const hidSourceId = normalizeControllerSysfsPath(hidPath);
  return evdevSourceId !== null && hidSourceId !== null && evdevSourceId === hidSourceId;
}

export function resolveEvdevSourceIdentity(devicePath: string): string | null {
  const eventNode = path.basename(devicePath);
  if (!eventNode.startsWith('event')) return null;
  try {
    return normalizeControllerSysfsPath(realpathSync(`/sys/class/input/${eventNode}/device`));
  } catch {
    return null;
  }
}

export function resolveHidSourceIdentity(hidPath: string): string | null {
  const hidNode = path.basename(hidPath);
  if (!hidNode.startsWith('hidraw')) return null;
  try {
    return normalizeControllerSysfsPath(realpathSync(`/sys/class/hidraw/${hidNode}/device`));
  } catch {
    return null;
  }
}
