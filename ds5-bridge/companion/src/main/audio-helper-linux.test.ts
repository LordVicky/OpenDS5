import { describe, expect, it } from 'vitest';
import { HapticsProcessor } from '../../native/audio-helper-linux.mjs';

describe('audio-helper-linux exports', () => {
  it('imports without running main and exposes HapticsProcessor', () => {
    const processor = new HapticsProcessor({
      gainPercent: 100, bassFocus: 'balanced', response: 'balanced',
      attack: 'balanced', release: 'balanced'
    });
    expect(typeof processor.process).toBe('function');
  });
});
