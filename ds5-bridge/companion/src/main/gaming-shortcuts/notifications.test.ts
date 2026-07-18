import { describe, expect, it } from 'vitest';
import { formatShortcutBindings } from './notifications';

describe('gaming shortcut notifications', () => {
  it('formats configured bindings and omits unassigned actions', () => {
    expect(formatShortcutBindings([
      { button: 'create', action: { type: 'screenshot', provider: 'auto' } },
      { button: 'options', action: { type: 'none' } },
      { button: 'dpad-up', action: { type: 'volume', direction: 'up' } }
    ])).toBe('Create  Screenshot\nD-pad Up  Volume');
  });

  it('truncates deterministically', () => {
    expect(formatShortcutBindings([
      { button: 'create', action: { type: 'screenshot', provider: 'auto' } },
      { button: 'triangle', action: { type: 'performance-hud-toggle', provider: 'auto' } },
      { button: 'mute', action: { type: 'microphone-mute-toggle' } }
    ], 2)).toContain('More shortcuts configured');
  });

  it('formats PS gesture bindings with their configured labels', () => {
    expect(formatShortcutBindings([
      { button: 'ps', label: 'PS press', action: { type: 'screenshot', provider: 'auto' } },
      { button: 'ps', label: 'PS double press', action: { type: 'none' } }
    ])).toBe('PS press  Screenshot');
  });
});
