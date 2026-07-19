import { describe, expect, it } from 'vitest';
import { DEFAULT_GAMING_SHORTCUTS_SETTINGS, normalizeGamingShortcutsSettings, resolveGamingShortcutBindings } from './gaming-shortcuts';

describe('normalizeGamingShortcutsSettings', () => {
  it('provides disabled, harmless defaults', () => {
    expect(normalizeGamingShortcutsSettings(undefined)).toEqual(DEFAULT_GAMING_SHORTCUTS_SETTINGS);
  });

  it('clamps timing and repairs malformed chords', () => {
    expect(normalizeGamingShortcutsSettings({
      enabled: true,
      doublePressWindowMs: 1,
      longPressThresholdMs: 99999,
      chordWindowMs: 151,
      singlePress: { type: 'open-opends5' },
      chords: [
        { button: 'create', action: { type: 'passthrough' } },
        { button: 'not-a-button', action: { type: 'custom-executable', executable: 'bad', args: [] } }
      ]
    })).toMatchObject({ enabled: true, doublePressWindowMs: 100, longPressThresholdMs: 2000, chordWindowMs: 151, chords: [{ button: 'create', action: { type: 'passthrough' } }] });
  });

  it('normalizes and resolves a per-game binding without changing global timing', () => {
    const settings = normalizeGamingShortcutsSettings({
      singlePress: { type: 'open-opends5' },
      perGameOverrides: {
        'steam:123': {
          singlePress: { type: 'volume', direction: 'mute' },
          chords: [{ button: 'create', action: { type: 'screenshot', provider: 'grim' } }]
        },
        broken: { singlePress: { type: 'custom-executable', executable: 'bad\0name', args: [] } }
      }
    });
    expect(settings.perGameOverrides.broken).toEqual({ singlePress: { type: 'none' } });
    expect(resolveGamingShortcutBindings(settings, 'steam:123')).toEqual({
      singlePress: { type: 'volume', direction: 'mute' },
      doublePress: { type: 'none' },
      longPress: { type: 'none' },
      chords: [{ button: 'create', action: { type: 'screenshot', provider: 'grim' } }]
    });
    expect(resolveGamingShortcutBindings(settings, null).singlePress).toEqual({ type: 'open-opends5' });
  });

  it('repairs the removed overlay action without affecting unrelated bindings', () => {
    const settings = normalizeGamingShortcutsSettings({
      singlePress: { type: 'open-overlay' },
      chords: [{ button: 'create', action: { type: 'screenshot', provider: 'grim' } }]
    });
    expect(settings.singlePress).toEqual({ type: 'none' });
    expect(settings.chords[0]).toEqual({ button: 'create', action: { type: 'screenshot', provider: 'grim' } });
    expect(settings.shortcutModeTimeoutMs).toBe(3000);
  });

  it('persists and resolves Edge back and function buttons as generic inputs', () => {
    const settings = normalizeGamingShortcutsSettings({
      chords: [
        { button: 'lb', action: { type: 'passthrough' } },
        { button: 'rb', action: { type: 'none' } },
        { button: 'lfn', action: { type: 'open-opends5' } },
        { button: 'rfn', action: { type: 'volume', direction: 'mute' } }
      ]
    });
    expect(settings.chords.map(({ button }) => button)).toEqual(['lb', 'rb', 'lfn', 'rfn']);
  });
});
