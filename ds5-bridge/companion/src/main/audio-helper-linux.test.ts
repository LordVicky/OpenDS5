import { describe, expect, it } from 'vitest';
import { channelIndices, hapticsPlaybackArgs, HapticsProcessor, nodeChannelLayout, pinnedChannelVolumes } from '../../native/audio-helper-linux.mjs';

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

import {
  appCaptureRecordArgs,
  busFrames,
  channelCompensation,
  channelIndices,
  matchAppStreamNode,
  matchAppStreamNodes,
  readHapticsConfig,
  sumBusFrames
} from '../../native/audio-helper-linux.mjs';

describe('channelCompensation', () => {
  it('is unity when ears and haptic match and sync is ON', () => {
    expect(channelCompensation(1, 1, true)).toBe(1);
  });

  it('follows the knob when the guard pins the haptic pair and sync is ON', () => {
    // ears track the volume (0.166), haptic pinned at unity by the guard.
    expect(channelCompensation(0.166, 1, true)).toBeCloseTo(0.166, 6);
  });

  it('is unity with no guard when sync is ON (ears == haptic)', () => {
    expect(channelCompensation(0.166, 0.166, true)).toBeCloseTo(1, 6);
  });

  it('boosts to 1/haptic with no guard when sync is OFF', () => {
    // desired unity over haptic 0.166 -> ~6.02, holding strength constant.
    expect(channelCompensation(0.166, 0.166, false)).toBeCloseTo(1 / 0.166, 4);
  });

  it('does not double-boost when the guard pins the pair and sync is OFF', () => {
    // haptic pinned at unity, desired unity -> no compensation.
    expect(channelCompensation(0.166, 1, false)).toBe(1);
  });

  it('treats garbage, zero, or non-finite inputs as unity', () => {
    expect(channelCompensation(0, 1, true)).toBe(1);
    expect(channelCompensation(-0.5, 1, true)).toBe(1);
    expect(channelCompensation(NaN, 1, true)).toBe(1);
    // A garbage haptic denominator falls back to actual = 1.
    expect(channelCompensation(0.5, 0, true)).toBeCloseTo(0.5, 6);
    expect(channelCompensation(0.5, NaN, true)).toBeCloseTo(0.5, 6);
    expect(channelCompensation(NaN, NaN, false)).toBe(1);
  });

  it('clamps at 32 and 1/32', () => {
    expect(channelCompensation(1, 0.001, true)).toBe(32);
    expect(channelCompensation(1, 0.001, false)).toBe(32);
    expect(channelCompensation(0.1, 1, true)).toBeCloseTo(0.1, 6);
    expect(channelCompensation(1, 100, false)).toBe(1 / 32);
  });
});

describe('HapticsProcessor output compensation', () => {
  function loudInput(frames: number) {
    const input = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f += 1) {
      const s = Math.sin(2 * Math.PI * 40 * (f / 48000)) * 0.9;
      input[f * 4] = s;
      input[f * 4 + 1] = s;
    }
    return input;
  }

  it('doubles nonzero samples at compensation 2 but clamps to unit magnitude', () => {
    const frames = 256;
    const input = loudInput(frames);
    const base = makeProcessor().process(input);
    const boosted = makeProcessor();
    boosted.setOutputCompensation(2);
    const out = boosted.process(input);
    for (let i = 0; i < out.length; i += 1) {
      if (base[i] === 0) {
        expect(out[i]).toBe(0);
      } else {
        expect(out[i]).toBeCloseTo(Math.max(-1, Math.min(1, base[i] * 2)), 6);
        expect(Math.abs(out[i])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('clips to exactly unit magnitude with a strong input and high compensation', () => {
    const frames = 256;
    const input = loudInput(frames);
    const clipped = makeProcessor();
    clipped.setOutputCompensation(8);
    const out = clipped.process(input);
    const peak = Math.max(...Array.from(out).map((s) => Math.abs(s)));
    expect(peak).toBe(1);
  });

  it('leaves output byte-identical to a fresh default processor at compensation 1', () => {
    const frames = 256;
    const input = loudInput(frames);
    const withComp = makeProcessor();
    withComp.setOutputCompensation(1);
    expect(Array.from(withComp.process(input))).toEqual(Array.from(makeProcessor().process(input)));
  });
});

describe('readHapticsConfig volume sync flag', () => {
  it('defaults volumeSync to true when the flag is absent', () => {
    expect(readHapticsConfig([]).volumeSync).toBe(true);
    expect(readHapticsConfig(['--haptics-gain', '120']).volumeSync).toBe(true);
  });

  it('reads volumeSync true when the flag is 1', () => {
    expect(readHapticsConfig(['--haptics-volume-sync', '1']).volumeSync).toBe(true);
  });

  it('reads volumeSync false when the flag is 0', () => {
    expect(readHapticsConfig(['--haptics-volume-sync', '0']).volumeSync).toBe(false);
  });
});

describe('HapticsProcessor always-applied compensation', () => {
  function loudInput(frames: number) {
    const input = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f += 1) {
      const s = Math.sin(2 * Math.PI * 40 * (f / 48000)) * 0.9;
      input[f * 4] = s;
      input[f * 4 + 1] = s;
    }
    return input;
  }

  it('always applies the output compensation regardless of the volumeSync flag', () => {
    // With per-channel compensation the poll folds volumeSync into the
    // computed scaling, so process() must apply it in every toggle state.
    const frames = 256;
    const input = loudInput(frames);
    const syncOn = makeProcessor();
    syncOn.setVolumeSync(true);
    syncOn.setOutputCompensation(6);
    const syncOff = makeProcessor();
    syncOff.setVolumeSync(false);
    syncOff.setOutputCompensation(6);
    // Both apply comp 6 identically; the flag no longer gates process().
    expect(Array.from(syncOn.process(input))).toEqual(Array.from(syncOff.process(input)));
  });

  it('is byte-identical to a fresh processor when compensation is unity (sync ON, no guard)', () => {
    const frames = 256;
    const input = loudInput(frames);
    const synced = makeProcessor();
    synced.setVolumeSync(true);
    synced.setOutputCompensation(channelCompensation(0.166, 0.166, true)); // ~1
    expect(Array.from(synced.process(input))).toEqual(Array.from(makeProcessor().process(input)));
  });

  it('applies the compensated (clamped) output for a nonzero compensation', () => {
    const frames = 256;
    const input = loudInput(frames);
    const base = makeProcessor();
    base.setOutputCompensation(1);
    const baseOut = base.process(input);
    const boosted = makeProcessor();
    boosted.setOutputCompensation(6);
    const out = boosted.process(input);
    let sawNonzero = false;
    for (let i = 0; i < out.length; i += 1) {
      if (baseOut[i] === 0) {
        expect(out[i]).toBe(0);
      } else {
        sawNonzero = true;
        expect(out[i]).toBeCloseTo(Math.max(-1, Math.min(1, baseOut[i] * 6)), 6);
      }
    }
    expect(sawNonzero).toBe(true);
  });
});

describe('appCaptureRecordArgs', () => {
  it('targets the app stream by object.serial, not by --target id (mic fallback)', () => {
    const node = { id: 297, info: { props: { 'object.serial': 48540 } } };
    const args = appCaptureRecordArgs(node, { channels: 4, position: ['FL', 'FR', 'RL', 'RR'] });
    const pIndex = args.indexOf('-P');
    expect(pIndex).toBeGreaterThanOrEqual(0);
    expect(args[pIndex + 1]).toBe('{ target.object = 48540 }');
    const channelsIndex = args.indexOf('--channels');
    expect(args[channelsIndex + 1]).toBe('4');
    const mapIndex = args.indexOf('--channel-map');
    expect(args[mapIndex + 1]).toBe('FL,FR,RL,RR');
    expect(args).not.toContain('--target');
  });

  it('falls back to node.id when object.serial is missing', () => {
    const node = { id: 297, info: { props: {} } };
    const args = appCaptureRecordArgs(node, { channels: 4, position: ['FL', 'FR', 'RL', 'RR'] });
    const pIndex = args.indexOf('-P');
    expect(args[pIndex + 1]).toBe('{ target.object = 297 }');
  });
});

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

  // Every wine app reports the same loader as its binary, so the executable
  // fallback cannot tell two Proton games apart. node.name carries the real
  // identity and survives the restart that invalidates the process id.
  describe('Proton apps', () => {
    const rivals = streamNode(60, {
      'application.process.id': 4321,
      'application.process.binary': 'wine64-preloader',
      'application.name': 'Marvel Rivals',
      'node.name': 'Marvel Rivals'
    });
    const nier = streamNode(61, {
      'application.process.id': 616,
      'application.process.binary': 'wine64-preloader',
      'application.name': 'NieR Replicant ver.1.22474487139...',
      'node.name': 'NieR Replicant ver.1.22474487139...'
    });

    it('matches the saved node name once the process id is stale', () => {
      expect(matchAppStreamNode([nier, rivals], {
        processId: 999999,
        executableName: 'wine64-preloader',
        processPath: null,
        sessionIdentifier: 'Marvel Rivals'
      })?.id).toBe(60);
    });

    it('does not attach to a different wine app via the shared loader binary', () => {
      expect(matchAppStreamNode([nier], {
        processId: 999999,
        executableName: 'wine64-preloader',
        processPath: null,
        sessionIdentifier: 'Marvel Rivals'
      })).toBeNull();
    });

    it('still matches on a live process id', () => {
      expect(matchAppStreamNode([nier, rivals], {
        processId: 616,
        executableName: 'wine64-preloader',
        processPath: null,
        sessionIdentifier: 'NieR Replicant ver.1.22474487139...'
      })?.id).toBe(61);
    });

    // Unreal titles publish several output streams at once and only one of
    // them carries the mix, so capturing a single node picks silence.
    it('returns every stream the app is publishing', () => {
      const second = streamNode(62, {
        'application.process.id': 4321,
        'application.process.binary': 'wine64-preloader',
        'node.name': 'Marvel Rivals'
      });
      const third = streamNode(63, {
        'application.process.id': 4321,
        'application.process.binary': 'wine64-preloader',
        'node.name': 'Marvel Rivals'
      });
      const ids = matchAppStreamNodes([rivals, nier, second, third], {
        processId: 4321,
        executableName: 'wine64-preloader',
        processPath: null,
        sessionIdentifier: 'Marvel Rivals'
      }).map((node) => node.id);
      expect(ids).toEqual([60, 62, 63]);
    });
  });
});

describe('busFrames', () => {
  it('passes a stereo stream through as FL/FR with no centre or bass', () => {
    const layout = channelIndices(['FL', 'FR']);
    expect(Array.from(busFrames(Float32Array.from([0.5, -0.25]), layout)))
      .toEqual([0.5, -0.25, 0, 0]);
  });

  it('keeps the centre and LFE of a 5.1 stream', () => {
    const layout = channelIndices(['FL', 'FR', 'FC', 'LFE', 'RL', 'RR']);
    // FL FR FC LFE RL RR -> the rears are dropped, the rest survive.
    expect(Array.from(busFrames(Float32Array.from([1, 2, 3, 4, 9, 9]), layout)))
      .toEqual([1, 2, 3, 4]);
  });

  it('drops the rears of a quadraphonic stream', () => {
    const layout = channelIndices(['FL', 'FR', 'RL', 'RR']);
    expect(Array.from(busFrames(Float32Array.from([1, 2, 9, 9]), layout)))
      .toEqual([1, 2, 0, 0]);
  });
});

describe('sumBusFrames', () => {
  it('adds the streams channel by channel', () => {
    const a = Float32Array.from([1, 2, 3, 4]);
    const b = Float32Array.from([10, 20, 30, 40]);
    expect(Array.from(sumBusFrames([a, b]))).toEqual([11, 22, 33, 44]);
  });

  // The whole point: the silent streams must not mask the one with audio.
  it('recovers the active stream when the others are silent', () => {
    const silent = new Float32Array(4);
    const active = Float32Array.from([0.5, -0.5, 0, 0.25]);
    expect(Array.from(sumBusFrames([silent, active, silent])))
      .toEqual([0.5, -0.5, 0, 0.25]);
  });

  it('returns the single stream untouched', () => {
    const only = Float32Array.from([0.5, 0.25, -0.75, 0.125]);
    expect(Array.from(sumBusFrames([only]))).toEqual([0.5, 0.25, -0.75, 0.125]);
  });
});

describe('hapticsPlaybackArgs', () => {
  const hasPair = (args: string[], a: string, b: string) => {
    for (let i = 0; i < args.length - 1; i += 1) {
      if (args[i] === a && args[i + 1] === b) {
        return true;
      }
    }
    return false;
  };

  it('pins the playback stream at unity and opts out of stream-restore', () => {
    const args = hapticsPlaybackArgs('sinkname');
    expect(hasPair(args, '--target', 'sinkname')).toBe(true);
    expect(hasPair(args, '--volume', '1')).toBe(true);
    expect(hasPair(args, '-P', '{ state.restore-props = false }')).toBe(true);
    expect(hasPair(args, '--channels', '4')).toBe(true);
    expect(hasPair(args, '--channel-map', 'FL,FR,RL,RR')).toBe(true);
    expect(args[args.length - 1]).toBe('-');
  });
});

describe('pinnedChannelVolumes', () => {
  it('returns null for a non-array or too-short input', () => {
    expect(pinnedChannelVolumes(undefined)).toBeNull();
    expect(pinnedChannelVolumes(null)).toBeNull();
    expect(pinnedChannelVolumes([0.3, 0.3, 0.3])).toBeNull();
  });

  it('returns null when the haptic pair is already pinned at unity', () => {
    expect(pinnedChannelVolumes([0.3, 0.3, 1, 1])).toBeNull();
    expect(pinnedChannelVolumes([1, 1, 1, 1])).toBeNull();
  });

  it('pins the haptic pair to unity while keeping the speaker channels', () => {
    expect(pinnedChannelVolumes([0.3, 0.3, 0.3, 0.3])).toEqual([0.3, 0.3, 1, 1]);
  });

  it('preserves any trailing channels beyond the first four', () => {
    expect(pinnedChannelVolumes([0.3, 0.3, 0.3, 0.3, 0.5, 0.5]))
      .toEqual([0.3, 0.3, 1, 1, 0.5, 0.5]);
  });
});
