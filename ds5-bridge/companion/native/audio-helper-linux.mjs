#!/usr/bin/env node
// Linux audio helper for the DS5 Bridge companion app.
//
// Speaks the same CLI + stdio protocol as the Windows AudioHelper.exe, but
// drives PipeWire: the vds virtual USB DualSense exposes a 4-channel pro-audio
// sink where channels 1-2 are the speaker/headphone path and channels 3-4 are
// the left/right haptic actuators.
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SAMPLE_RATE = 48000;
const BRIDGE_NODE_PATTERN = /dualsense|vds/i;

const BASS_FOCUS_CUTOFF_HZ = { deep: 80, balanced: 160, punchy: 240, wide: 400 }; // matches UI labels
const RESPONSE_GAIN = { subtle: 0.6, balanced: 1.0, strong: 1.5 };
const ATTACK_MS = { soft: 30, balanced: 15, fast: 8, sharp: 3 };
const RELEASE_MS = { tight: 60, balanced: 120, smooth: 250, long: 450 };

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function pwDump() {
  return new Promise((resolve, reject) => {
    execFile('pw-dump', [], { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function nodeProps(object) {
  return object?.info?.props ?? {};
}

const STEREO_LAYOUT = { channels: 2, position: ['FL', 'FR'] };

// Negotiated audio format of a pw-dump node; stereo fallback when absent
// or inconsistent (spec: unknown layouts read as first-two-channel stereo).
export function nodeChannelLayout(node) {
  const format = node?.info?.params?.Format?.[0];
  const channels = Number(format?.channels ?? 0);
  const position = Array.isArray(format?.position) ? format.position : null;
  if (!position || channels < 1 || position.length !== channels) {
    return { ...STEREO_LAYOUT, position: [...STEREO_LAYOUT.position] };
  }
  return { channels, position: [...position] };
}

export function channelIndices(position) {
  const stride = position.length;
  let fl = position.indexOf('FL');
  let fr = position.indexOf('FR');
  if (fl < 0 || fr < 0) {
    fl = 0;
    fr = Math.min(1, stride - 1);
  }
  return { stride, fl, fr, fc: position.indexOf('FC'), lfe: position.indexOf('LFE') };
}

function isAudioSink(object) {
  return object.type === 'PipeWire:Interface:Node'
    && nodeProps(object)['media.class'] === 'Audio/Sink';
}

function isBridgeSink(object) {
  const props = nodeProps(object);
  if (!isAudioSink(object)) {
    return false;
  }
  const bridgeName = [
    props['node.name'],
    props['node.description'],
    props['node.nick'],
    props['device.product.name'],
    props['device.description'],
    props['device.nick']
  ].some((value) => BRIDGE_NODE_PATTERN.test(value ?? ''));
  const wirelessController = /wireless controller/i.test(
    `${props['node.description'] ?? ''} ${props['node.nick'] ?? ''} ${props['device.description'] ?? ''} ${props['device.nick'] ?? ''}`
  );
  const fourChannel = Number(props['audio.channels']) === 4;
  return bridgeName || (wirelessController && fourChannel);
}

async function findBridgeSink() {
  const objects = await pwDump();
  // Prefer the ALSA sink of the virtual controller over loopback filters.
  const sinks = objects.filter(isBridgeSink);
  const alsaSink = sinks.find((sink) => (nodeProps(sink)['node.name'] ?? '').startsWith('alsa_output'));
  return alsaSink ?? sinks[0] ?? null;
}

async function requireBridgeSink() {
  const sink = await findBridgeSink();
  if (!sink) {
    fail('status: capture-unavailable DualSense audio sink not found. '
      + 'Set the controller card profile to pro-audio (wpctl set-profile).');
  }
  return sink;
}

function biquadLowpass(cutoffHz) {
  const w0 = 2 * Math.PI * cutoffHz / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cosW0) / 2) / a0,
    b1: (1 - cosW0) / a0,
    b2: ((1 - cosW0) / 2) / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
    x1: 0, x2: 0, y1: 0, y2: 0
  };
}

function biquadStep(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x;
  f.y2 = f.y1; f.y1 = y;
  return y;
}

function envelopeCoefficient(milliseconds) {
  return Math.exp(-1 / (SAMPLE_RATE * (milliseconds / 1000)));
}

// The guard pins the haptic channels while the ear channels track the
// knob, so compensation must be computed from the sink's real per-channel
// volumes: desired scaling (ears when syncing, unity when not) over what
// the sink actually applies to the haptic pair. Correct in all four
// toggle states, guard running or not.
export function channelCompensation(earsLinear, hapticLinear, volumeSync) {
  const desired = volumeSync
    ? (Number.isFinite(earsLinear) && earsLinear > 0 ? earsLinear : 1)
    : 1;
  const actual = Number.isFinite(hapticLinear) && hapticLinear > 0 ? hapticLinear : 1;
  return Math.min(32, Math.max(1 / 32, desired / actual));
}

export class HapticsProcessor {
  constructor(config) {
    this.envelope = 0;
    this.layout = { stride: 4, fl: 0, fr: 1, fc: -1, lfe: -1 };
    this.outputCompensation = 1;
    // Volume Sync (default ON): haptics follow the listening volume. This is
    // an input to the per-channel compensation math (see channelCompensation),
    // which the poll reads via processor.volumeSync; process() always applies
    // the resulting outputCompensation.
    this.volumeSync = true;
    this.setConfig(config);
  }

  setOutputCompensation(compensation) {
    this.outputCompensation = compensation;
  }

  setVolumeSync(enabled) {
    this.volumeSync = enabled;
  }

  setConfig({ gainPercent, bassFocus, response, attack, release }) {
    this.gain = Math.max(0, Math.min(400, gainPercent)) / 100;
    this.responseGain = RESPONSE_GAIN[response] ?? 1.0;
    this.attackCoeff = envelopeCoefficient(ATTACK_MS[attack] ?? 15);
    this.releaseCoeff = envelopeCoefficient(RELEASE_MS[release] ?? 120);
    const cutoff = BASS_FOCUS_CUTOFF_HZ[bassFocus] ?? 90;
    this.lowpassLeft = biquadLowpass(cutoff);
    this.lowpassRight = biquadLowpass(cutoff);
  }

  setInputLayout(layout) {
    this.layout = layout;
  }

  // Layout-aware input (see setInputLayout) -> 4ch f32 out
  // (speaker channels silent, haptics on 3-4). Blend per spec:
  // left/right = FL/FR + 0.5*FC + 1.0*LFE; rears and sides ignored.
  process(input) {
    const { stride, fl, fr, fc, lfe } = this.layout;
    const frames = Math.floor(input.length / stride);
    const output = new Float32Array(frames * 4);
    for (let frame = 0; frame < frames; frame += 1) {
      const base = frame * stride;
      const center = fc >= 0 ? input[base + fc] * 0.5 : 0;
      const bass = lfe >= 0 ? input[base + lfe] : 0;
      const left = biquadStep(this.lowpassLeft, input[base + fl] + center + bass);
      const right = biquadStep(this.lowpassRight, input[base + fr] + center + bass);
      const peak = Math.max(Math.abs(left), Math.abs(right));
      const coeff = peak > this.envelope ? this.attackCoeff : this.releaseCoeff;
      this.envelope = coeff * this.envelope + (1 - coeff) * peak;
      // Music bass peaks well below full scale and the daemon quantizes
      // haptics to 8 bits, so drive hard into the tanh limiter; gate the
      // noise floor so silence does not buzz the actuators.
      const gate = this.envelope < 0.003 ? 0 : 1;
      const drive = this.gain * this.responseGain * 4 * gate;
      // Compensation is always applied: the poll computes ears/haptic from
      // the sink's real per-channel volumes (unity when no guard runs and
      // sync ON, the ear volume when the guard pins the haptic pair).
      const comp = this.outputCompensation;
      output[frame * 4 + 2] = Math.max(-1, Math.min(1, Math.tanh(left * drive) * comp));
      output[frame * 4 + 3] = Math.max(-1, Math.min(1, Math.tanh(right * drive) * comp));
    }
    return output;
  }
}

export function readHapticsConfig(args) {
  return {
    gainPercent: Number(argValue(args, '--haptics-gain') ?? 100),
    bassFocus: argValue(args, '--haptics-bass-focus') ?? 'balanced',
    response: argValue(args, '--haptics-response') ?? 'balanced',
    attack: argValue(args, '--haptics-attack') ?? 'balanced',
    release: argValue(args, '--haptics-release') ?? 'balanced',
    // Volume Sync defaults ON: only an explicit "0" disables it.
    volumeSync: argValue(args, '--haptics-volume-sync') !== '0'
  };
}

async function runRenderLoopbackHaptics(args) {
  const sink = await requireBridgeSink();
  const target = nodeProps(sink)['node.name'];
  const config = readHapticsConfig(args);
  const processor = new HapticsProcessor(config);
  processor.setVolumeSync(config.volumeSync);

  const appSource = {
    processId: Number(argValue(args, '--haptics-app-process-id') ?? 0),
    processPath: argValue(args, '--haptics-app-process-path'),
    executableName: argValue(args, '--haptics-app-executable'),
    sessionIdentifier: argValue(args, '--haptics-app-session-id')
  };
  const hasAppSource = appSource.processId > 0 || Boolean(appSource.processPath)
    || Boolean(appSource.executableName) || Boolean(appSource.sessionIdentifier);

  // Optional capture pin: monitor a specific output device instead of
  // following the system default sink.
  const captureDevice = argValue(args, '--haptics-output-device');

  const play = spawn('pw-play', hapticsPlaybackArgs(target), { stdio: ['pipe', 'ignore', 'pipe'] });
  play.stderr.on('data', (chunk) => process.stderr.write(chunk));

  let record = null;
  let attachTimer = null;
  let volumeTimer = null;
  let stopping = false;
  let announcedRecording = false;

  // Playback always goes to the bridge sink. Its per-channel volumes
  // (ears = channel 0, haptic = channel 2) drive the compensation: the
  // volume guard may pin the haptic pair at unity while the ear channels
  // track the knob, so a single scalar is not enough. Poll pw-dump, cache
  // the channel volumes, and recompute so a live sync toggle applies at
  // once instead of waiting for the next poll.
  let lastChannelVolumes = null;
  let lastCompError = null;
  const applyCompensation = () => {
    if (lastChannelVolumes) {
      processor.setOutputCompensation(
        channelCompensation(lastChannelVolumes[0], lastChannelVolumes[2], processor.volumeSync)
      );
    }
  };
  const refreshVolumeCompensation = async () => {
    try {
      const objects = await pwDump();
      const found = objects.find((object) => object.id === sink.id)
        ?? objects.filter(isBridgeSink).find((s) => (nodeProps(s)['node.name'] ?? '').startsWith('alsa_output'))
        ?? objects.filter(isBridgeSink)[0]
        ?? null;
      const cv = found?.info?.params?.Props?.[0]?.channelVolumes;
      if (Array.isArray(cv) && cv.length >= 3) {
        lastChannelVolumes = cv;
        applyCompensation();
      }
      // channelVolumes unavailable: keep the last compensation.
    } catch (error) {
      if (error.message !== lastCompError) {
        lastCompError = error.message;
        process.stderr.write(`volume compensation poll failed: ${error.message}\n`);
      }
    }
  };
  refreshVolumeCompensation();
  volumeTimer = setInterval(refreshVolumeCompensation, 2000);

  const shutdown = (code, detail) => {
    stopping = true;
    if (detail) {
      process.stderr.write(`${detail}\n`);
    }
    clearTimeout(attachTimer);
    clearInterval(volumeTimer);
    record?.kill();
    play.kill();
    process.exit(code);
  };
  play.on('exit', (code) => shutdown(code ?? 1, 'playback stream ended'));

  const pipeRecordToProcessor = (proc, stride) => {
    let carry = Buffer.alloc(0);
    proc.stdout.on('data', (chunk) => {
      let data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const frameBytes = stride * 4; // stride channels x f32
      const usable = data.length - (data.length % frameBytes);
      carry = data.subarray(usable);
      if (usable === 0) {
        return;
      }
      const input = new Float32Array(data.buffer, data.byteOffset, usable / 4);
      const output = processor.process(input);
      if (play.stdin.writable) {
        play.stdin.write(Buffer.from(output.buffer, 0, output.byteLength));
      }
    });
    proc.stderr.on('data', (chunk) => process.stderr.write(chunk));
    proc.on('spawn', () => {
      if (!announcedRecording) {
        announcedRecording = true;
        process.stderr.write('status: recording-started\n');
      }
    });
  };

  const startSinkMonitorCapture = () => {
    record = spawn('pw-record', [
      '--raw',
      '-P', '{ stream.capture.sink = true }',
      ...(captureDevice ? ['--target', captureDevice] : []),
      // Capture four discrete channels and let the processor use the fronts
      // only. When the headset is plugged in, the default sink can be the
      // bridge's own 4-channel device; any narrower capture goes through
      // PipeWire's channel mixer, which folds the rear haptics channels we
      // play back into the fronts (constant buzz / self-oscillation). With a
      // matching 4ch format no mixing happens; stereo sinks upmix with
      // silent rears, leaving the fronts intact either way.
      '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '4',
      '--channel-map', 'FL,FR,RL,RR',
      '--latency', '256',
      '-'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    pipeRecordToProcessor(record, 4);
    record.on('exit', (code) => {
      if (!stopping) {
        shutdown(code ?? 1, 'capture stream ended');
      }
    });
  };

  // Pre-fold app capture: target the app's own output stream so discrete
  // surround channels (especially LFE) survive even when the listening
  // device is stereo. The node comes and goes with the game, so poll and
  // re-attach instead of failing hard.
  const APP_POLL_MS = 2000;
  const pollForAppNode = async () => {
    if (stopping) {
      return;
    }
    let node = null;
    try {
      node = matchAppStreamNode(await pwDump(), appSource);
    } catch (error) {
      process.stderr.write(`app node poll failed: ${error.message}\n`);
    }
    if (!node) {
      attachTimer = setTimeout(pollForAppNode, APP_POLL_MS);
      return;
    }
    const layout = nodeChannelLayout(node);
    processor.setInputLayout(channelIndices(layout.position));
    record = spawn('pw-record', appCaptureRecordArgs(node, layout), { stdio: ['ignore', 'pipe', 'pipe'] });
    pipeRecordToProcessor(record, layout.channels);
    record.on('exit', () => {
      // Game restarted its stream (level load, restart): go back to polling.
      record = null;
      if (!stopping) {
        process.stderr.write('status: waiting-for-app\n');
        attachTimer = setTimeout(pollForAppNode, APP_POLL_MS);
      }
    });
  };

  if (hasAppSource) {
    process.stderr.write('status: waiting-for-app\n');
    await pollForAppNode();
  } else {
    startSinkMonitorCapture();
  }

  const control = createInterface({ input: process.stdin });
  control.on('line', (line) => {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'haptics-config' && parts.length >= 6) {
      processor.setConfig({
        gainPercent: Number(parts[1]),
        bassFocus: parts[2],
        response: parts[3],
        attack: parts[4],
        release: parts[5]
      });
      // 7th field is optional so 6-field lines keep working: absent → sync ON.
      processor.setVolumeSync(parts[6] === undefined ? true : parts[6] === '1');
      // Recompute from the cached channel volumes so the toggle applies now.
      applyCompensation();
    } else if (parts[0] === 'stop') {
      shutdown(0);
    }
  });
  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGINT', () => shutdown(0));
}

async function runPlayTestTone(args) {
  const sink = await requireBridgeSink();
  const target = nodeProps(sink)['node.name'];
  const audioPath = argValue(args, '--test-audio-path');
  if (!audioPath) {
    fail('missing --test-audio-path');
  }
  const volume = Math.max(0, Math.min(100, Number(argValue(args, '--speaker-volume') ?? 100))) / 100;
  await new Promise((resolve, reject) => {
    const play = spawn('pw-play', ['--target', target, '--volume', `${volume}`, audioPath], {
      stdio: ['ignore', 'ignore', 'inherit']
    });
    play.on('error', reject);
    play.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pw-play exited ${code}`))));
  });
}

function buildHapticsTestWave(gainPercent) {
  const gain = Math.max(0, Math.min(400, gainPercent)) / 100;
  const seconds = 1.6;
  const frames = Math.round(seconds * SAMPLE_RATE);
  const wave = new Float32Array(frames * 4);
  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / SAMPLE_RATE;
    // Two rumble bursts: low 40 Hz swell, then a punchier 80 Hz pulse train.
    let amp = 0;
    if (t < 0.7) {
      amp = Math.sin(Math.PI * (t / 0.7)) * Math.sin(2 * Math.PI * 40 * t);
    } else if (t >= 0.8) {
      const u = t - 0.8;
      const pulse = Math.exp(-6 * (u % 0.25));
      amp = pulse * Math.sin(2 * Math.PI * 80 * t);
    }
    const sample = Math.tanh(amp * gain);
    wave[frame * 4 + 2] = sample;
    wave[frame * 4 + 3] = sample;
  }
  return wave;
}

async function runPlayTestHaptics(args) {
  const sink = await requireBridgeSink();
  const target = nodeProps(sink)['node.name'];
  const gain = Number(argValue(args, '--haptics-gain') ?? 100);
  const wave = buildHapticsTestWave(gain);
  await new Promise((resolve, reject) => {
    const play = spawn('pw-play', [
      '--raw',
      '--target', target,
      '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '4',
      '--channel-map', 'FL,FR,RL,RR',
      '-'
    ], { stdio: ['pipe', 'ignore', 'inherit'] });
    play.on('error', reject);
    play.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pw-play exited ${code}`))));
    play.stdin.end(Buffer.from(wave.buffer));
  });
}

async function defaultSinkName() {
  return new Promise((resolve) => {
    execFile('wpctl', ['inspect', '@DEFAULT_AUDIO_SINK@'], (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const description = stdout.match(/node\.description = "([^"]*)"/);
      const name = stdout.match(/node\.name = "([^"]*)"/);
      resolve({
        description: description?.[1] ?? '',
        name: name?.[1] ?? ''
      });
    });
  });
}

// Prints the audio output sinks as a JSON array for the Audio Haptics
// capture-device picker. The bridge's own sink is excluded: capturing it
// would feed the haptics we play back into the processor.
async function runListOutputSinks() {
  const objects = await pwDump();
  const current = await defaultSinkName();
  const devices = objects
    .filter((object) => isAudioSink(object) && !isBridgeSink(object))
    .map((object) => {
      const props = nodeProps(object);
      const nodeName = props['node.name'] ?? '';
      return {
        nodeName,
        displayName: props['node.description'] || nodeName,
        isDefault: nodeName === (current?.name ?? '')
      };
    })
    .filter((device) => device.nodeName);
  process.stdout.write(`${JSON.stringify(devices)}\n`);
}

async function runDefaultRenderStatus() {
  const current = await defaultSinkName();
  const deviceName = current?.description || current?.name || '';
  const isBridgeEndpoint = BRIDGE_NODE_PATTERN.test(current?.name ?? '')
    || BRIDGE_NODE_PATTERN.test(current?.description ?? '');
  process.stdout.write(`${JSON.stringify({ deviceName, isBridgeEndpoint })}\n`);
}

async function runSetDefaultRenderBridge() {
  const sink = await requireBridgeSink();
  await new Promise((resolve, reject) => {
    execFile('wpctl', ['set-default', `${sink.id}`], (error) => (error ? reject(error) : resolve()));
  });
}

// The helper owns its output level (gain, limiter, sink-volume
// compensation), so pin the playback stream at unity and opt out of
// WirePlumber's stream-restore: a remembered mixer tweak on "pw-play"
// must not silently scale the haptics.
export function hapticsPlaybackArgs(target) {
  return [
    '--raw',
    '--target', target,
    '--volume', '1',
    '-P', '{ state.restore-props = false }',
    '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '4',
    '--channel-map', 'FL,FR,RL,RR',
    '--latency', '256',
    '-'
  ];
}

export function appCaptureRecordArgs(node, layout) {
  const serial = nodeProps(node)['object.serial'];
  return [
    '--raw',
    // Target the app's own output stream by serial: WirePlumber ignores a
    // plain --target <id> for playback streams and falls back to the
    // default source (the microphone), which is silence for haptics.
    '-P', `{ target.object = ${serial ?? node.id} }`,
    '--format', 'f32', '--rate', `${SAMPLE_RATE}`,
    '--channels', `${layout.channels}`,
    '--channel-map', layout.position.join(','),
    '--latency', '256',
    '-'
  ];
}

// Wine reports its loader as the client binary, so every Proton game looks
// identical here. Such a name identifies the runtime, never the game.
export const GENERIC_WINE_BINARIES = new Set([
  'wine', 'wine64', 'wine-preloader', 'wine64-preloader', 'wineserver'
]);

export function matchAppStreamNode(objects, { processId, executableName, processPath, sessionIdentifier }) {
  const pathBasename = processPath ? processPath.split('/').pop() : null;
  const identifiesApp = (name) => Boolean(name) && !GENERIC_WINE_BINARIES.has(name);
  const matches = objects.filter((object) => {
    if (object.type !== 'PipeWire:Interface:Node') {
      return false;
    }
    const props = nodeProps(object);
    if (props['media.class'] !== 'Stream/Output/Audio') {
      return false;
    }
    if (processId > 0 && Number(props['application.process.id'] ?? 0) === processId) {
      return true;
    }
    // The stream name outlives the process id across a game restart, and is
    // the only thing distinguishing one wine app from another.
    if (sessionIdentifier
      && (props['node.name'] === sessionIdentifier || props['application.name'] === sessionIdentifier)) {
      return true;
    }
    const binary = props['application.process.binary'] ?? null;
    return identifiesApp(binary)
      && (binary === executableName || binary === pathBasename);
  });
  return matches.find((object) => object.info?.state === 'running') ?? matches[0] ?? null;
}

async function listOutputStreamSessions() {
  const objects = await pwDump();
  const bridge = await findBridgeSink().catch(() => null);
  const bridgeName = bridge ? nodeProps(bridge)['node.name'] : '';
  const sessions = [];
  const seen = new Set();
  for (const object of objects) {
    if (object.type !== 'PipeWire:Interface:Node') {
      continue;
    }
    const props = nodeProps(object);
    if (props['media.class'] !== 'Stream/Output/Audio') {
      continue;
    }
    const processId = Number(props['application.process.id'] ?? 0);
    const displayName = props['application.name'] || props['node.name'] || 'Unknown';
    const key = `${processId}:${displayName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sessions.push({
      processId,
      displayName,
      executableName: props['application.process.binary'] ?? null,
      processPath: null,
      iconPath: null,
      sessionIdentifier: props['node.name'] ?? null,
      sessionInstanceIdentifier: `${object.id}`,
      state: object.info?.state === 'running' ? 'active' : 'inactive',
      endpointName: props['target.object'] ?? bridgeName ?? '',
      isSelected: false
    });
  }
  return sessions;
}

async function runMonitorAudioSessions() {
  let stopped = false;
  const emit = async () => {
    if (stopped) {
      return;
    }
    try {
      const sessions = await listOutputStreamSessions();
      process.stdout.write(`${JSON.stringify({ type: 'snapshot', sessions })}\n`);
    } catch (error) {
      process.stderr.write(`session snapshot failed: ${error.message}\n`);
    }
  };
  await emit();
  const timer = setInterval(emit, 2000);
  const control = createInterface({ input: process.stdin });
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    process.exit(0);
  };
  control.on('line', (line) => {
    if (line.trim() === 'stop') {
      stop();
    }
  });
  control.on('close', stop);
  process.on('SIGTERM', stop);
}

// Desktop volume controls rewrite all four channels of the bridge sink;
// when HD Volume Sync is off the haptic pair (3-4) must stay at unity so
// game HD haptics don't fade with the listening volume.
export function pinnedChannelVolumes(current) {
  if (!Array.isArray(current) || current.length < 4) {
    return null;
  }
  if (current[2] === 1 && current[3] === 1) {
    return null;
  }
  return [current[0], current[1], 1, 1, ...current.slice(4)];
}

const VOLUME_GUARD_INTERVAL_MS = 2000;

async function runVolumeGuard() {
  let stopping = false;
  // Hard-fail the first tick when the sink is missing (mirrors the other
  // helper modes): the parent only starts the guard once the controller
  // audio path is ready, so a missing sink at boot is a real setup error.
  let sink = await requireBridgeSink();

  const pinTick = async () => {
    if (stopping) {
      return;
    }
    try {
      // Re-find the sink each tick so the guard survives the sink coming
      // and going with the controller. channelVolumes change as the user
      // adjusts volume, so always read them fresh from a live pw-dump.
      const found = await findBridgeSink();
      if (!found) {
        process.stderr.write('volume guard: bridge sink not found, retrying\n');
        return;
      }
      sink = found;
      const vols = sink.info?.params?.Props?.[0]?.channelVolumes;
      const pinned = pinnedChannelVolumes(vols);
      if (!pinned) {
        return;
      }
      await new Promise((resolve) => {
        execFile('pw-cli', [
          'set-param', `${sink.id}`, 'Props',
          `{ channelVolumes: [ ${pinned.join(', ')} ] }`
        ], (error) => {
          if (error) {
            process.stderr.write(`volume guard: set-param failed: ${error.message}\n`);
          }
          resolve();
        });
      });
    } catch (error) {
      process.stderr.write(`volume guard tick failed: ${error.message}\n`);
    }
  };

  await pinTick();
  const timer = setInterval(pinTick, VOLUME_GUARD_INTERVAL_MS);
  const control = createInterface({ input: process.stdin });
  const stop = () => {
    stopping = true;
    clearInterval(timer);
    process.exit(0);
  };
  control.on('line', (line) => {
    if (line.trim() === 'stop') {
      stop();
    }
  });
  control.on('close', stop);
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

function runMicKeepalive() {
  // Microphone input is unsupported over the vds Bluetooth transport; stay
  // alive so the engine's lifecycle management works, but do nothing.
  process.stderr.write('mic keepalive: unsupported on Linux (vds Bluetooth transport)\n');
  setInterval(() => {}, 60_000);
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--play-test-tone')) {
    await runPlayTestTone(args);
  } else if (args.includes('--play-test-haptics')) {
    await runPlayTestHaptics(args);
  } else if (args.includes('--list-output-sinks')) {
    await runListOutputSinks();
  } else if (args.includes('--default-render-status')) {
    await runDefaultRenderStatus();
  } else if (args.includes('--set-default-render-bridge')) {
    await runSetDefaultRenderBridge();
  } else if (args.includes('--monitor-audio-sessions')) {
    await runMonitorAudioSessions();
  } else if (args.includes('--volume-guard')) {
    await runVolumeGuard();
  } else if (args.includes('--mic-keepalive-only')) {
    runMicKeepalive();
  } else if (argValue(args, '--source') === 'render-loopback') {
    await runRenderLoopbackHaptics(args);
  } else {
    fail(`unsupported arguments: ${args.join(' ')}`);
  }
}

const isCliEntry = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCliEntry) {
  main().catch((error) => fail(error.message));
}
