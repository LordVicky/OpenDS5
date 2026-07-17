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

function makeProcessor() {
  return new HapticsProcessor({
    gainPercent: 100, bassFocus: 'balanced', response: 'balanced',
    attack: 'balanced', release: 'balanced'
  });
}

describe('HapticsProcessor layouts', () => {
  it('default 4ch layout matches explicit FL,FR,RL,RR layout sample-for-sample', () => {
    const frames = 64;
    const input = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f += 1) {
      input[f * 4] = Math.sin(f / 3) * 0.5;      // FL
      input[f * 4 + 1] = Math.cos(f / 3) * 0.5;  // FR
      input[f * 4 + 2] = 0.9;                    // RL: must be ignored
      input[f * 4 + 3] = -0.9;                   // RR: must be ignored
    }
    const byDefault = makeProcessor().process(input);
    const explicit = makeProcessor();
    explicit.setInputLayout({ stride: 4, fl: 0, fr: 1, fc: -1, lfe: -1 });
    expect(Array.from(explicit.process(input))).toEqual(Array.from(byDefault));
  });

  it('5.1 layout blends FC at 0.5x and LFE at 1x into both sides', () => {
    const frames = 64;
    const layout = { stride: 6, fl: 0, fr: 1, fc: 2, lfe: 3 };
    // Only FC and LFE carry signal: expect output driven purely by the blend.
    const surround = new Float32Array(frames * 6);
    for (let f = 0; f < frames; f += 1) {
      surround[f * 6 + 2] = Math.sin(f / 4) * 0.4; // FC
      surround[f * 6 + 3] = Math.sin(f / 4) * 0.4; // LFE
    }
    // Equivalent stereo signal: FL = FR = 0.5*FC + 1.0*LFE.
    const folded = new Float32Array(frames * 2);
    for (let f = 0; f < frames; f += 1) {
      const blend = 0.5 * surround[f * 6 + 2] + surround[f * 6 + 3];
      folded[f * 2] = blend;
      folded[f * 2 + 1] = blend;
    }
    const surroundProcessor = makeProcessor();
    surroundProcessor.setInputLayout(layout);
    const stereoProcessor = makeProcessor();
    stereoProcessor.setInputLayout({ stride: 2, fl: 0, fr: 1, fc: -1, lfe: -1 });
    const a = surroundProcessor.process(surround);
    const b = stereoProcessor.process(folded);
    expect(a.length).toBe(frames * 4);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]).toBeCloseTo(b[i], 6);
    }
  });

  it('rears and sides in a 7.1 stream never reach the output', () => {
    const frames = 32;
    const quiet = new Float32Array(frames * 8); // silence everywhere
    const noisyRears = new Float32Array(frames * 8);
    for (let f = 0; f < frames; f += 1) {
      for (const ch of [4, 5, 6, 7]) {
        noisyRears[f * 8 + ch] = 0.8;
      }
    }
    const layout = { stride: 8, fl: 0, fr: 1, fc: 2, lfe: 3 };
    const p1 = makeProcessor(); p1.setInputLayout(layout);
    const p2 = makeProcessor(); p2.setInputLayout(layout);
    expect(Array.from(p1.process(noisyRears))).toEqual(Array.from(p2.process(quiet)));
  });
});

import { matchAppStreamNode } from '../../native/audio-helper-linux.mjs';

function streamNode(id: number, props: Record<string, unknown>, state = 'running') {
  return {
    id,
    type: 'PipeWire:Interface:Node',
    info: { state, props: { 'media.class': 'Stream/Output/Audio', ...props } }
  };
}

describe('matchAppStreamNode', () => {
  const game = streamNode(40, { 'application.process.id': 1234, 'application.process.binary': 'game-bin' });
  const music = streamNode(41, { 'application.process.id': 999, 'application.process.binary': 'spotify' });
  const sinkNode = { id: 50, type: 'PipeWire:Interface:Node', info: { state: 'running', props: { 'media.class': 'Audio/Sink' } } };

  it('matches by process id', () => {
    expect(matchAppStreamNode([music, game, sinkNode], { processId: 1234, executableName: null, processPath: null })?.id).toBe(40);
  });

  it('falls back to the executable name', () => {
    expect(matchAppStreamNode([music, game], { processId: 0, executableName: 'game-bin', processPath: null })?.id).toBe(40);
  });

  it('falls back to the process path basename', () => {
    expect(matchAppStreamNode([music, game], { processId: 0, executableName: null, processPath: '/opt/game/game-bin' })?.id).toBe(40);
  });

  it('prefers a running node over an idle one', () => {
    const idle = streamNode(42, { 'application.process.binary': 'game-bin' }, 'idle');
    const running = streamNode(43, { 'application.process.binary': 'game-bin' }, 'running');
    expect(matchAppStreamNode([idle, running], { processId: 0, executableName: 'game-bin', processPath: null })?.id).toBe(43);
  });

  it('returns null when nothing matches or only non-streams exist', () => {
    expect(matchAppStreamNode([music, sinkNode], { processId: 1234, executableName: 'game-bin', processPath: null })).toBeNull();
  });
});
