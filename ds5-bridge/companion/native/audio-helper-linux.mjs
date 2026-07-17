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

function isAudioSink(object) {
  return object.type === 'PipeWire:Interface:Node'
    && nodeProps(object)['media.class'] === 'Audio/Sink';
}

function isBridgeSink(object) {
  const props = nodeProps(object);
  return isAudioSink(object) && (
    BRIDGE_NODE_PATTERN.test(props['node.name'] ?? '')
    || BRIDGE_NODE_PATTERN.test(props['node.description'] ?? '')
    || BRIDGE_NODE_PATTERN.test(props['device.product.name'] ?? '')
  );
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

class HapticsProcessor {
  constructor(config) {
    this.envelope = 0;
    this.setConfig(config);
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

  // stereo f32 in -> 4ch f32 out (speaker channels silent, haptics on 3-4)
  process(input) {
    const frames = input.length / 2;
    const output = new Float32Array(frames * 4);
    for (let frame = 0; frame < frames; frame += 1) {
      const left = biquadStep(this.lowpassLeft, input[frame * 2]);
      const right = biquadStep(this.lowpassRight, input[frame * 2 + 1]);
      const peak = Math.max(Math.abs(left), Math.abs(right));
      const coeff = peak > this.envelope ? this.attackCoeff : this.releaseCoeff;
      this.envelope = coeff * this.envelope + (1 - coeff) * peak;
      // Music bass peaks well below full scale and the daemon quantizes
      // haptics to 8 bits, so drive hard into the tanh limiter; gate the
      // noise floor so silence does not buzz the actuators.
      const gate = this.envelope < 0.003 ? 0 : 1;
      const drive = this.gain * this.responseGain * 4 * gate;
      output[frame * 4 + 2] = Math.tanh(left * drive);
      output[frame * 4 + 3] = Math.tanh(right * drive);
    }
    return output;
  }
}

function readHapticsConfig(args) {
  return {
    gainPercent: Number(argValue(args, '--haptics-gain') ?? 100),
    bassFocus: argValue(args, '--haptics-bass-focus') ?? 'balanced',
    response: argValue(args, '--haptics-response') ?? 'balanced',
    attack: argValue(args, '--haptics-attack') ?? 'balanced',
    release: argValue(args, '--haptics-release') ?? 'balanced'
  };
}

async function runRenderLoopbackHaptics(args) {
  const sink = await requireBridgeSink();
  const target = nodeProps(sink)['node.name'];
  const processor = new HapticsProcessor(readHapticsConfig(args));

  // Optional capture pin: monitor a specific output device instead of
  // following the system default sink.
  const captureDevice = argValue(args, '--haptics-output-device');
  const record = spawn('pw-record', [
    '--raw',
    '-P', '{ stream.capture.sink = true }',
    ...(captureDevice ? ['--target', captureDevice] : []),
    // Capture the front channels only. When the headset is plugged in, the
    // default sink can be the bridge's own 4-channel device; an unmapped
    // stereo capture downmixes the rear haptics channels we play into it,
    // feeding our own output back (constant buzz / self-oscillation).
    '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '2',
    '--channel-map', 'FL,FR',
    '--latency', '256',
    '-'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const play = spawn('pw-play', [
    '--raw',
    '--target', target,
    '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '4',
    '--channel-map', 'FL,FR,RL,RR',
    '--latency', '256',
    '-'
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  // Report readiness on stream startup: a suspended default sink delivers no
  // monitor frames until something plays, and the app only waits 8 s.
  record.on('spawn', () => {
    process.stderr.write('status: recording-started\n');
  });

  let carry = Buffer.alloc(0);
  record.stdout.on('data', (chunk) => {
    let data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    const frameBytes = 2 * 4;
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

  const shutdown = (code, detail) => {
    if (detail) {
      process.stderr.write(`${detail}\n`);
    }
    record.kill();
    play.kill();
    process.exit(code);
  };
  record.stderr.on('data', (chunk) => process.stderr.write(chunk));
  play.stderr.on('data', (chunk) => process.stderr.write(chunk));
  record.on('exit', (code) => shutdown(code ?? 1, 'capture stream ended'));
  play.on('exit', (code) => shutdown(code ?? 1, 'playback stream ended'));

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
  } else if (args.includes('--mic-keepalive-only')) {
    runMicKeepalive();
  } else if (argValue(args, '--source') === 'render-loopback') {
    await runRenderLoopbackHaptics(args);
  } else {
    fail(`unsupported arguments: ${args.join(' ')}`);
  }
}

main().catch((error) => fail(error.message));
