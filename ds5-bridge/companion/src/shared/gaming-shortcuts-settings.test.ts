import { describe, expect, it } from 'vitest';
import { DEFAULT_GAMING_SHORTCUTS_SETTINGS, normalizeGamingShortcutsSettings } from './gaming-shortcuts';

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
});
