import { describe, expect, it } from 'vitest';
import { channelIndices, HapticsProcessor, nodeChannelLayout } from '../../native/audio-helper-linux.mjs';

describe('audio-helper-linux exports', () => {
  it('imports without running main and exposes HapticsProcessor', () => {
    const processor = new HapticsProcessor({
      gainPercent: 100, bassFocus: 'balanced', response: 'balanced',
      attack: 'balanced', release: 'balanced'
    });
    expect(typeof processor.process).toBe('function');
  });
});

describe('nodeChannelLayout', () => {
  it('reads channels and position from the Format param', () => {
    const node = { info: { params: { Format: [{ mediaType: 'audio', channels: 6, position: ['FL', 'FR', 'FC', 'LFE', 'RL', 'RR'] }] } } };
    expect(nodeChannelLayout(node)).toEqual({ channels: 6, position: ['FL', 'FR', 'FC', 'LFE', 'RL', 'RR'] });
  });

  it('falls back to stereo when the format is missing', () => {
    expect(nodeChannelLayout({ info: { params: {} } })).toEqual({ channels: 2, position: ['FL', 'FR'] });
    expect(nodeChannelLayout(undefined)).toEqual({ channels: 2, position: ['FL', 'FR'] });
  });

  it('falls back to stereo when position length disagrees with channels', () => {
    const node = { info: { params: { Format: [{ channels: 6, position: ['FL', 'FR'] }] } } };
    expect(nodeChannelLayout(node)).toEqual({ channels: 2, position: ['FL', 'FR'] });
  });
});

describe('channelIndices', () => {
  it('maps stereo', () => {
    expect(channelIndices(['FL', 'FR'])).toEqual({ stride: 2, fl: 0, fr: 1, fc: -1, lfe: -1 });
  });

  it('maps 5.1', () => {
    expect(channelIndices(['FL', 'FR', 'FC', 'LFE', 'RL', 'RR'])).toEqual({ stride: 6, fl: 0, fr: 1, fc: 2, lfe: 3 });
  });

  it('maps 7.1', () => {
    expect(channelIndices(['FL', 'FR', 'FC', 'LFE', 'RL', 'RR', 'SL', 'SR'])).toEqual({ stride: 8, fl: 0, fr: 1, fc: 2, lfe: 3 });
  });

  it('treats an unknown map as first-two-channels stereo', () => {
    expect(channelIndices(['AUX0', 'AUX1', 'AUX2'])).toEqual({ stride: 3, fl: 0, fr: 1, fc: -1, lfe: -1 });
  });

  it('maps mono to both sides', () => {
    expect(channelIndices(['MONO'])).toEqual({ stride: 1, fl: 0, fr: 0, fc: -1, lfe: -1 });
  });
});
