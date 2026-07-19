import { describe, expect, it } from 'vitest';

import { VDS_MODULE_VERSION_PATH, readVdsKernelVersion } from './vds-kernel-version';

describe('readVdsKernelVersion', () => {
  it('reads the loaded vds_hcd module version', () => {
    const version = readVdsKernelVersion(() => '1.7.0-beta.1\n');

    expect(version).toBe('1.7.0-beta.1');
  });

  it('reads it from the loaded module rather than the installed package', () => {
    let requested: string | null = null;
    readVdsKernelVersion((file) => {
      requested = file;
      return '1.7.0-beta.1\n';
    });

    expect(requested).toBe(VDS_MODULE_VERSION_PATH);
    expect(VDS_MODULE_VERSION_PATH).toBe('/sys/module/vds_hcd/version');
  });

  it('returns null when the module is not loaded', () => {
    const version = readVdsKernelVersion(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    expect(version).toBeNull();
  });

  it('returns null when the version file is empty', () => {
    expect(readVdsKernelVersion(() => '   \n')).toBeNull();
  });
});
