import { describe, expect, it } from 'vitest';
import { shouldShowSetupWizard } from './setup-window';

describe('shouldShowSetupWizard', () => {
  it('only on linux, when needed, and not skipped', () => {
    expect(shouldShowSetupWizard({ platform: 'linux', needed: true, skipped: false })).toBe(true);
    expect(shouldShowSetupWizard({ platform: 'win32', needed: true, skipped: false })).toBe(false);
    expect(shouldShowSetupWizard({ platform: 'linux', needed: false, skipped: false })).toBe(false);
    expect(shouldShowSetupWizard({ platform: 'linux', needed: true, skipped: true })).toBe(false);
  });
});
