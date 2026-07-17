# Pre-fold Per-App Haptics Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Linux audio helper honor the app-source flags the engine already sends, capturing the selected app's PipeWire stream pre-fold-down and summing FL/FR/FC/LFE deliberately so surround games drive haptics with their discrete LFE channel.

**Architecture:** All changes live in the single-file Linux helper `ds5-bridge/companion/native/audio-helper-linux.mjs` (it is packaged as one file — do not split it). Pure logic (channel-layout parsing, node matching, summing) is exported for vitest; process orchestration (hot-attach loop) stays in the same file behind an import guard. The engine (`audio-helper.ts`) and UI need no changes.

**Tech Stack:** Node.js ESM (.mjs), PipeWire CLI tools (`pw-dump`, `pw-record`, `pw-play`), vitest (tests live under `src/` because `test:companion` is `vitest run src`).

**Spec:** `docs/superpowers/specs/2026-07-17-haptics-prefold-capture-design.md`

## Global Constraints

- Sink-monitor path (no app selected) must stay numerically identical to today (feedback fix 02792b1 intact).
- Summing weights: `left = FL + 0.5×FC + 1.0×LFE`, `right = FR + 0.5×FC + 1.0×LFE`; rears/sides excluded.
- Unknown/missing channel layout falls back to stereo interpretation of the first two channels.
- Hot-attach poll cadence: 2000 ms (matches the existing session monitor).
- Helper output is always 4ch f32 with haptics on channels 3–4.
- Never push to any remote; commit locally only. No Co-Authored-By trailers.
- Run tests from `ds5-bridge/companion/`.

---

### Task 1: Make the helper importable and export its internals

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (bottom of file, `main()` invocation; add `export` keywords)
- Test: `ds5-bridge/companion/src/main/audio-helper-linux.test.ts` (create)

**Interfaces:**
- Produces: named exports from the .mjs — `HapticsProcessor`, plus (added in later tasks) `nodeChannelLayout`, `channelIndices`, `matchAppStreamNode`. Importing the module must have no side effects (no `pw-dump`, no exit).

- [ ] **Step 1: Write the failing test**

Create `ds5-bridge/companion/src/main/audio-helper-linux.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: FAIL — `HapticsProcessor` is not exported (SyntaxError: does not provide an export), or the import hangs/exits because `main()` runs. Either failure mode confirms the gap.

- [ ] **Step 3: Export internals and guard main()**

In `native/audio-helper-linux.mjs`:

Add to the imports at the top:

```js
import { pathToFileURL } from 'node:url';
```

Change `class HapticsProcessor {` to `export class HapticsProcessor {`.

Replace the last line of the file:

```js
main().catch((error) => fail(error.message));
```

with:

```js
const isCliEntry = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCliEntry) {
  main().catch((error) => fail(error.message));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Sanity-check the CLI still runs**

Run: `node ds5-bridge/companion/native/audio-helper-linux.mjs --list-output-sinks`
Expected: a JSON array on stdout (device list; contents depend on machine). This proves the import guard still executes `main()` when invoked as a CLI.

- [ ] **Step 6: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs ds5-bridge/companion/src/main/audio-helper-linux.test.ts
git commit -m "Make Linux audio helper importable for unit tests"
```

---

### Task 2: Channel-layout parsing and index mapping

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (add two exported functions near `nodeProps`)
- Test: `ds5-bridge/companion/src/main/audio-helper-linux.test.ts` (append)

**Interfaces:**
- Consumes: pw-dump node objects (`object.info.params.Format[0]` carries `{ channels, position }` for a negotiated audio node).
- Produces:
  - `nodeChannelLayout(node) -> { channels: number, position: string[] }` — stereo `{channels: 2, position: ['FL','FR']}` fallback when the format is absent/invalid.
  - `channelIndices(position: string[]) -> { stride: number, fl: number, fr: number, fc: number, lfe: number }` — indices are `-1` when the channel is absent; `stride` equals `position.length`; if FL/FR are missing, `fl = 0` and `fr = Math.min(1, stride - 1)` (mono maps both sides to channel 0).

- [ ] **Step 1: Write the failing tests**

Append to `src/main/audio-helper-linux.test.ts`:

```ts
import { channelIndices, nodeChannelLayout } from '../../native/audio-helper-linux.mjs';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: FAIL — `nodeChannelLayout`/`channelIndices` not exported.

- [ ] **Step 3: Implement**

Add after `nodeProps` in `native/audio-helper-linux.mjs`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs ds5-bridge/companion/src/main/audio-helper-linux.test.ts
git commit -m "Parse PipeWire stream channel layouts in the Linux audio helper"
```

---

### Task 3: Layout-aware summing in HapticsProcessor

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (`HapticsProcessor`)
- Test: `ds5-bridge/companion/src/main/audio-helper-linux.test.ts` (append)

**Interfaces:**
- Consumes: `channelIndices` result shape from Task 2.
- Produces: `HapticsProcessor.setInputLayout({ stride, fl, fr, fc, lfe })`. Default layout (set in the constructor) is `{ stride: 4, fl: 0, fr: 1, fc: -1, lfe: -1 }` — exactly today's fixed 4ch fronts-only behavior, so the sink-monitor path needs no call-site change. `process(input)` consumes `stride` channels per frame and still emits 4ch output with haptics on channels 3–4.

- [ ] **Step 1: Write the failing tests**

Append to `src/main/audio-helper-linux.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: FAIL — `setInputLayout` is not a function.

- [ ] **Step 3: Implement**

In `HapticsProcessor`:

Add to the constructor, before `this.setConfig(config)`:

```js
    this.layout = { stride: 4, fl: 0, fr: 1, fc: -1, lfe: -1 };
```

Add the method after `setConfig`:

```js
  setInputLayout(layout) {
    this.layout = layout;
  }
```

Replace the `process` method (keep the existing gate/drive comment block):

```js
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
      output[frame * 4 + 2] = Math.tanh(left * drive);
      output[frame * 4 + 3] = Math.tanh(right * drive);
    }
    return output;
  }
```

- [ ] **Step 4: Run the full companion suite**

Run: `cd ds5-bridge/companion && npx vitest run src`
Expected: all tests PASS (the new layout tests plus the existing suite — proves the default layout keeps sink-monitor numerics identical).

- [ ] **Step 5: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs ds5-bridge/companion/src/main/audio-helper-linux.test.ts
git commit -m "Blend FC and LFE into haptics with layout-aware summing"
```

---

### Task 4: App stream node matching

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (add exported function near `listOutputStreamSessions`)
- Test: `ds5-bridge/companion/src/main/audio-helper-linux.test.ts` (append)

**Interfaces:**
- Consumes: pw-dump object array; app source descriptor `{ processId, executableName, processPath }` (any field may be null/0 — mirrors the optional CLI flags in `audio-helper.ts:216-226`).
- Produces: `matchAppStreamNode(objects, appSource) -> node | null`. Match priority: `application.process.id` equals `processId`; else `application.process.binary` equals `executableName` or the basename of `processPath`. Among several matches, prefer `info.state === 'running'`; otherwise first match.

- [ ] **Step 1: Write the failing tests**

Append to `src/main/audio-helper-linux.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: FAIL — `matchAppStreamNode` not exported.

- [ ] **Step 3: Implement**

Add before `listOutputStreamSessions` in `native/audio-helper-linux.mjs`:

```js
export function matchAppStreamNode(objects, { processId, executableName, processPath }) {
  const pathBasename = processPath ? processPath.split('/').pop() : null;
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
    const binary = props['application.process.binary'] ?? null;
    return Boolean(binary && (binary === executableName || binary === pathBasename));
  });
  return matches.find((object) => object.info?.state === 'running') ?? matches[0] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs ds5-bridge/companion/src/main/audio-helper-linux.test.ts
git commit -m "Match the selected app's PipeWire output stream in the Linux helper"
```

---

### Task 5: Hot-attach app capture loop

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (`runRenderLoopbackHaptics`)

**Interfaces:**
- Consumes: `matchAppStreamNode`, `nodeChannelLayout`, `channelIndices`, `HapticsProcessor.setInputLayout` from Tasks 2–4; CLI flags `--haptics-app-process-id`, `--haptics-app-process-path`, `--haptics-app-executable` (sent by `audio-helper.ts` startInternal).
- Produces: when any app flag is present, the helper hot-attaches to the app's stream instead of the sink monitor. Stderr status lines: `status: waiting-for-app` on entering polling, `status: recording-started` on first attach (the app waits up to 8 s for this — emitting it on the *record spawn*, as today, is preserved). Playback pipe to the bridge sink persists across re-attaches; `stop`/SIGTERM tear everything down.

- [ ] **Step 1: Restructure runRenderLoopbackHaptics**

Replace the body of `runRenderLoopbackHaptics` from the `const captureDevice = ...` line through the `record.on('exit', ...)` / `play.on('exit', ...)` lines (keep the sink lookup, processor construction, and the trailing control/SIGTERM block) with:

```js
  const appSource = {
    processId: Number(argValue(args, '--haptics-app-process-id') ?? 0),
    processPath: argValue(args, '--haptics-app-process-path'),
    executableName: argValue(args, '--haptics-app-executable')
  };
  const hasAppSource = appSource.processId > 0 || Boolean(appSource.processPath)
    || Boolean(appSource.executableName);

  // Optional capture pin: monitor a specific output device instead of
  // following the system default sink.
  const captureDevice = argValue(args, '--haptics-output-device');

  const play = spawn('pw-play', [
    '--raw',
    '--target', target,
    '--format', 'f32', '--rate', `${SAMPLE_RATE}`, '--channels', '4',
    '--channel-map', 'FL,FR,RL,RR',
    '--latency', '256',
    '-'
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  play.stderr.on('data', (chunk) => process.stderr.write(chunk));

  let record = null;
  let attachTimer = null;
  let stopping = false;
  let announcedRecording = false;

  const shutdown = (code, detail) => {
    stopping = true;
    if (detail) {
      process.stderr.write(`${detail}\n`);
    }
    clearTimeout(attachTimer);
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
    record = spawn('pw-record', [
      '--raw',
      '--target', `${node.id}`,
      '--format', 'f32', '--rate', `${SAMPLE_RATE}`,
      '--channels', `${layout.channels}`,
      '--channel-map', layout.position.join(','),
      '--latency', '256',
      '-'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
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
```

The existing `control`/`SIGTERM`/`SIGINT` block at the end of the function stays as-is (it already calls `shutdown`), and the old top-level `record`/`carry`/`shutdown` definitions it replaced must be deleted.

- [ ] **Step 2: Run the full companion suite**

Run: `cd ds5-bridge/companion && npx vitest run src`
Expected: all tests PASS (no regressions; this task is exercised by hand next).

- [ ] **Step 3: Manual smoke — sink-monitor path unchanged**

With the controller connected and no app flags:

Run: `DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE=1 node ds5-bridge/companion/native/audio-helper-linux.mjs --source render-loopback --haptics-only --haptics-gain 100 --haptics-bass-focus balanced --haptics-response balanced --haptics-attack balanced --haptics-release balanced`
Expected: `status: recording-started` on stderr; playing music makes the controller rumble; Ctrl-C exits cleanly.

- [ ] **Step 4: Manual smoke — app capture and hot-attach**

Start the helper with an app flag before the app plays audio:

Run: `DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE=1 node ds5-bridge/companion/native/audio-helper-linux.mjs --source render-loopback --haptics-only --haptics-gain 100 --haptics-bass-focus balanced --haptics-response balanced --haptics-attack balanced --haptics-release balanced --haptics-app-executable <binary-name-from-pw-dump>`
Expected: `status: waiting-for-app`, then `status: recording-started` once the app starts playing; only that app's audio drives haptics (music from another app does not). Kill and restart the app's audio: helper prints `status: waiting-for-app` and re-attaches.

- [ ] **Step 5: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs
git commit -m "Hot-attach pre-fold app stream capture for audio haptics"
```

---

### Task 6: Hardware verification (user-assisted)

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `cd ds5-bridge/companion && npm run test:companion`
Expected: all PASS.

- [ ] **Step 2: Surround LFE verification**

In the app, select a surround-capable game (forced to 5.1/7.1 in its own audio settings) as the Audio Haptics source while listening on stereo headphones. Confirm with `pw-dump` that the game's stream negotiated >2 channels, and that LFE-heavy moments (explosions) produce a stronger punch than the sink-monitor source does. Tuning checkpoints from the spec: sanity-check the 0.5× FC weight, and check whether any felt-worthy bass lives in RL/RR (if so, consider adding rears at ~0.3× as a follow-up).

- [ ] **Step 3: Regression — 3.5 mm feedback fix**

Switch the source back to system audio (sink monitor) with the 3.5 mm headset plugged in. Expected: no constant buzz (02792b1 fix intact).

- [ ] **Step 4: Isolation check**

With the game selected as source, play music/Discord audio from another app. Expected: haptics respond only to the game.
