#!/usr/bin/env node
// Linux audio helper for the DS5 Bridge companion app.
//
// Speaks the same CLI + stdio protocol as the Windows AudioHelper.exe, but
// drives PipeWire: the vds virtual USB DualSense exposes a 4-channel pro-audio
// sink where channels 1-2 are the speaker/headphone path and channels 3-4 are
// the left/right haptic actuators.
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
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
  // Only the virtual controller's ALSA sink is a valid target; loopback
  // filters with DualSense-ish names (leftover user configs) are dead ends.
  const sinks = objects.filter(isBridgeSink);
  return sinks.find((sink) => (nodeProps(sink)['node.name'] ?? '').startsWith('alsa_output')) ?? null;
}

// The USB card takes a moment to enumerate after the controller bridges.
async function waitForBridgeSink(timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const sink = await findBridgeSink();
    if (sink) {
      return sink;
    }
    if (Date.now() > deadline) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function vdsdAudioSocketPath() {
  if (process.env.VDSD_SOCKET) {
    return `${process.env.VDSD_SOCKET}-audio`;
  }
  const bases = [
    '/run/vds/vdsd.sock',
    '/run/vdsd.sock',
    process.env.XDG_RUNTIME_DIR ? `${process.env.XDG_RUNTIME_DIR}/vdsd.sock` : null
  ].filter(Boolean);
  for (const base of bases) {
    if (existsSync(`${base}-audio`)) {
      return `${base}-audio`;
    }
  }
  return `${bases[0]}-audio`;
}

// Audio output resolution: prefer the virtual USB sink (kernel backend);
// fall back to vdsd's PCM side channel when running on the uhid backend.
async function resolveAudioOutput() {
  // uhid mode advertises its PCM side channel; otherwise wait for the card.
  if (existsSync(vdsdAudioSocketPath())) {
    return { kind: 'socket', path: vdsdAudioSocketPath() };
  }
  const sink = await waitForBridgeSink();
  if (sink) {
    return { kind: 'sink', target: nodeProps(sink)['node.name'] };
  }
  fail('status: capture-unavailable DualSense audio sink not found. '
    + 'Set the controller card profile to pro-audio (wpctl set-profile), '
    + 'or start vdsd with the uhid backend for the audio side channel.');
  return null;
}

// Streams 4-channel S16 48 kHz PCM to the vdsd audio socket at real-time
// pace (the daemon queues only a few 10 ms chunks).
function openSocketWriter(path) {
  const socket = createConnection(path);
  socket.on('error', () => {});
  const bytesPerSecond = SAMPLE_RATE * 4 * 2;
  let streamStart = null;
  let sent = 0;
  return {
    write(bufferS16) {
      socket.write(bufferS16);
    },
    async writePaced(bufferS16) {
      const now = Date.now();
      if (streamStart === null) {
        streamStart = now;
      }
      const elapsed = (now - streamStart) / 1000;
      const ahead = sent / bytesPerSecond - elapsed;
      if (ahead > 0.05) {
        await new Promise((resolve) => setTimeout(resolve, ahead * 1000 - 30));
      }
      socket.write(bufferS16);
      sent += bufferS16.length;
    },
    end() {
      socket.end();
    }
  };
}

function floatTo4chS16(float4ch) {
  const out = Buffer.alloc(float4ch.length * 2);
  for (let i = 0; i < float4ch.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, float4ch[i]));
    out.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return out;
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
  const output = await resolveAudioOutput();
  const processor = new HapticsProcessor(readHapticsConfig(args));
  if (output.kind === 'socket') {
    return runRenderLoopbackHapticsToSocket(output.path, processor);
  }
  const target = output.target;

  const record = spawn('pw-record', [
    '--raw',
    '-P', '{ stream.capture.sink = true }',
    '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '2',
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

// uhid backend: capture the default sink monitor with pw-record, run the
// same DSP, and stream 4-channel PCM to the vdsd audio socket.
function runRenderLoopbackHapticsToSocket(socketPath, processor) {
  const writer = openSocketWriter(socketPath);
  const record = spawn('pw-record', [
    '--raw',
    '-P', '{ stream.capture.sink = true }',
    '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '2',
    '--latency', '256',
    '-'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

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
    writer.write(floatTo4chS16(processor.process(input)));
  });

  const shutdown = (code, detail) => {
    if (detail) {
      process.stderr.write(`${detail}\n`);
    }
    record.kill();
    writer.end();
    process.exit(code);
  };
  record.stderr.on('data', (chunk) => process.stderr.write(chunk));
  record.on('exit', (code) => shutdown(code ?? 1, 'capture stream ended'));

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
  return new Promise(() => {});
}

async function playToneToSocket(socketPath, audioPath, volume) {
  const decode = spawn('ffmpeg', [
    '-v', 'error', '-i', audioPath,
    '-f', 's16le', '-ar', `${SAMPLE_RATE}`, '-ac', '2', '-'
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  const writer = openSocketWriter(socketPath);
  let carry = Buffer.alloc(0);
  const pending = [];
  decode.stdout.on('data', (chunk) => {
    let data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    const usable = data.length - (data.length % 4);
    carry = data.subarray(usable);
    if (usable === 0) {
      return;
    }
    const frames = usable / 4;
    const out = Buffer.alloc(frames * 8);
    for (let f = 0; f < frames; f += 1) {
      const left = data.readInt16LE(f * 4);
      const right = data.readInt16LE(f * 4 + 2);
      out.writeInt16LE(Math.round(left * volume), f * 8);
      out.writeInt16LE(Math.round(right * volume), f * 8 + 2);
    }
    pending.push(writer.writePaced(out));
  });
  await new Promise((resolve, reject) => {
    decode.on('error', () => reject(new Error('ffmpeg is required for the speaker test on the uhid backend')));
    decode.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
  await Promise.all(pending);
  writer.end();
}

async function runPlayTestTone(args) {
  const audioPath = argValue(args, '--test-audio-path');
  if (!audioPath) {
    fail('missing --test-audio-path');
  }
  const volume = Math.max(0, Math.min(100, Number(argValue(args, '--speaker-volume') ?? 100))) / 100;
  const output = await resolveAudioOutput();
  if (output.kind === 'socket') {
    await playToneToSocket(output.path, audioPath, volume);
    return;
  }
  const target = output.target;
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
  const gain = Number(argValue(args, '--haptics-gain') ?? 100);
  const wave = buildHapticsTestWave(gain);
  const output = await resolveAudioOutput();
  if (output.kind === 'socket') {
    const writer = openSocketWriter(output.path);
    const bytes = floatTo4chS16(wave);
    const blockBytes = (SAMPLE_RATE / 50) * 8; // 20 ms blocks
    for (let offset = 0; offset < bytes.length; offset += blockBytes) {
      await writer.writePaced(bytes.subarray(offset, offset + blockBytes));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    writer.end();
    return;
  }
  const target = output.target;
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

async function runDefaultRenderStatus() {
  const current = await defaultSinkName();
  const deviceName = current?.description || current?.name || '';
  const isBridgeEndpoint = BRIDGE_NODE_PATTERN.test(current?.name ?? '')
    || BRIDGE_NODE_PATTERN.test(current?.description ?? '');
  process.stdout.write(`${JSON.stringify({ deviceName, isBridgeEndpoint })}\n`);
}

async function runSetDefaultRenderBridge() {
  const sink = await findBridgeSink();
  if (!sink) {
    if (existsSync(vdsdAudioSocketPath())) {
      return; // uhid backend: no system audio endpoint to switch
    }
    fail('DualSense audio sink not found.');
  }
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
