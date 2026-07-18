import { describe, expect, it } from 'vitest';
import { validateGamingShortcutAction } from './gaming-shortcuts';

describe('validateGamingShortcutAction', () => {
  it('preserves valid typed actions', () => {
    expect(validateGamingShortcutAction({ type: 'custom-executable', executable: 'notify-send', args: ['hello'] }))
      .toEqual({ type: 'custom-executable', executable: 'notify-send', args: ['hello'] });
  });

  it.each([
    undefined,
    { type: 'unknown' },
    { type: 'launch-app', executable: '', args: [] },
    { type: 'launch-app', executable: 'bad\0name', args: [] },
    { type: 'volume', direction: 'sideways' },
    { type: 'screenshot', provider: 'missing' },
    { type: 'focus-app', appId: 'org.example.App' },
    { type: 'switch-application', direction: 'next' },
    { type: 'quit-active-game', confirmation: true },
    { type: 'custom-executable', executable: 'tool', args: ['bad\0arg'] }
  ])('repairs malformed data to none: %j', (value) => {
    expect(validateGamingShortcutAction(value)).toEqual({ type: 'none' });
  });

  it('allows empty argument arrays but caps oversized arrays', () => {
    expect(validateGamingShortcutAction({ type: 'launch-app', executable: 'game', args: [] })).toEqual({ type: 'launch-app', executable: 'game', args: [] });
    expect(validateGamingShortcutAction({ type: 'launch-app', executable: 'game', args: Array(65).fill('arg') })).toEqual({ type: 'none' });
  });
});
