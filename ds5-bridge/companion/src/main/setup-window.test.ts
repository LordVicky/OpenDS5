import fs from 'node:fs';
import path from 'node:path';
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

describe('window dismissal', () => {
  // Regression: closing the window via the WM used to call onSkip, persisting
  // setupSkipped=true and silently disabling setup forever — including when the
  // window closed because the renderer crashed.
  it('closing without choosing calls onDismiss, never onSkip', () => {
    const source = fs.readFileSync(path.join(__dirname, 'setup-window.ts'), 'utf8');
    const closedHandler = source.slice(source.indexOf("win.on('closed'"));
    expect(closedHandler).toContain('opts.onDismiss()');
    expect(closedHandler).not.toContain('opts.onSkip()');
  });
});
