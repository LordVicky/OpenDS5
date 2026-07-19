import fs from 'node:fs';

/**
 * The version of the vds_hcd module currently loaded in the kernel.
 *
 * Deliberately read from /sys/module rather than `modinfo`: modinfo reports the
 * module file installed on disk for the running kernel, which drifts from what
 * is actually loaded after a kernel switch leaves a stale module resident. The
 * loaded version is what governs runtime behaviour, so it is what we show.
 */
export const VDS_MODULE_VERSION_PATH = '/sys/module/vds_hcd/version';

/**
 * Returns null when the module is not loaded, which is also when the bridge
 * cannot work at all - the caller renders a placeholder rather than an error.
 *
 * This reads a sysfs pseudo-file, not the controller, so it is cheap enough to
 * call per status poll and stays correct across a module reload.
 */
export function readVdsKernelVersion(
  readFile: (file: string) => string = (file) => fs.readFileSync(file, 'utf8')
): string | null {
  let raw: string;
  try {
    raw = readFile(VDS_MODULE_VERSION_PATH);
  } catch {
    return null;
  }
  const version = raw.trim();
  return version.length > 0 ? version : null;
}
