import { describe, expect, it } from 'vitest';
import { resolveInstallerPath, shouldRunSystemInstall } from './install-system-cli';

describe('install-system CLI', () => {
  it('detects the flag anywhere in argv', () => {
    expect(shouldRunSystemInstall(['electron', '.', '--install-system'])).toBe(true);
    expect(shouldRunSystemInstall(['electron', '.'])).toBe(false);
  });

  it('resolves the bundled installer under resources', () => {
    expect(resolveInstallerPath('/tmp/res')).toBe('/tmp/res/installer/opends5-install');
  });
});
