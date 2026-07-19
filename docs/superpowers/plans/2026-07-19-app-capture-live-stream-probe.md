# App Capture Live-Stream Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture only the app audio streams that actually carry signal, instead of capturing every stream an app publishes, so per-app haptics cost one `pw-record` in steady state and a silent stream can never stall the mix.

**Architecture:** `native/audio-helper-linux.mjs` currently opens a `pw-record` for *every* stream matching the selected app and gates the mixer on all of them. This plan adds a two-role lifecycle: a newly seen stream is attached as `probing`, its peak amplitude is measured over a short window, and it is either promoted to `live` (feeds the mix) or closed and marked `dormant` (re-probed on a cooldown). The mixer gates only on `live` streams, and a `live` stream that stops delivering data entirely is dropped so it cannot block output.

**Tech Stack:** Node.js ESM (`.mjs`, no build step), PipeWire CLI (`pw-record` / `pw-dump`), Vitest.

## Global Constraints

- Target file is `native/audio-helper-linux.mjs`. It is plain ESM run directly by Electron; there is **no TypeScript and no build step** for it.
- Pure helpers must be `export`ed from that file so `src/main/audio-helper-linux.test.ts` can unit test them. That test file imports directly: `from '../../native/audio-helper-linux.mjs'`.
- The module must not execute `main()` on import — existing tests rely on this. Do not move code above the existing import-guard.
- Run tests with `npx vitest run src` from `ds5-bridge/companion`. Current baseline: **852 tests passing** (verified 2026-07-19 10:13).
- Do **not** change `matchAppStreamNodes`, `busFrames`, `sumBusFrames`, `appCaptureRecordArgs`, or `nodeChannelLayout`. Their behaviour is already correct and covered by tests.
- Commit after every task. Do not push (this repo's owner pushes manually).

## Background: why this change

Marvel Rivals (Unreal, via Proton) publishes three `Stream/Output/Audio` nodes under one PID. Measured directly with `pw-record`:

| node | serial | media.name | content |
|---|---|---|---|
| 84 | 40659 | audio stream #1 | silent |
| 131 | 40686 | audio stream #3 | **audio present** (peak 0.176) |
| 169 | 41889 | audio stream #7 | silent |

No static PipeWire property distinguishes them — all three report `state: running`, `stream.is-live: true`, and the same binary. Only sampling the data tells them apart. The current code therefore captures all three, which costs two permanently-idle `pw-record` processes (~19 MB and ~0.6% of one core each, measured) and makes `mixReadyBlocks()` wait on streams that may never deliver.

## File Structure

- **Modify:** `ds5-bridge/companion/native/audio-helper-linux.mjs`
  - New exported pure helpers: `peakAmplitude`, `hasSignal`, `readyLiveStreams`.
  - New constants: `SIGNAL_PEAK_THRESHOLD`, `PROBE_WINDOW_MS`, `DORMANT_RETRY_MS`, `DORMANT_RETRY_IDLE_MS`, `LIVE_STALL_MS`.
  - Rework the app-capture block (currently ~lines 374–475): `startAppStream` gains a role, `mixReadyBlocks` gates on live streams, `syncAppStreams` honours dormant cooldowns.
- **Modify (tests):** `ds5-bridge/companion/src/main/audio-helper-linux.test.ts`
  - Append new `describe` blocks. Follow the existing style: import the named export at the top of the file's import list, plain `it(...)` assertions, no mocks.

---

### Task 1: Signal detection helpers

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs`
- Test: `ds5-bridge/companion/src/main/audio-helper-linux.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `peakAmplitude(frames: Float32Array): number`, `hasSignal(peak: number): boolean`, `SIGNAL_PEAK_THRESHOLD: number`.

- [ ] **Step 1: Write the failing test**

Append to `src/main/audio-helper-linux.test.ts`:

```ts
describe('peakAmplitude', () => {
  it('is zero for a digitally silent block', () => {
    expect(peakAmplitude(new Float32Array(64))).toBe(0);
  });

  it('returns the largest magnitude regardless of sign', () => {
    expect(peakAmplitude(new Float32Array([0.1, -0.4, 0.25]))).toBeCloseTo(0.4, 6);
  });

  it('is zero for an empty block', () => {
    expect(peakAmplitude(new Float32Array(0))).toBe(0);
  });
});

describe('hasSignal', () => {
  it('rejects digital silence', () => {
    expect(hasSignal(0)).toBe(false);
  });

  it('rejects dither-level noise below the threshold', () => {
    expect(hasSignal(SIGNAL_PEAK_THRESHOLD / 2)).toBe(false);
  });

  it('accepts quiet but real game audio', () => {
    // -60 dBFS: far below anything audible as "loud", still clearly not silence.
    expect(hasSignal(0.001)).toBe(true);
  });

  it('accepts a normal mix level', () => {
    expect(hasSignal(0.176)).toBe(true);
  });
});
```

Add `peakAmplitude`, `hasSignal`, and `SIGNAL_PEAK_THRESHOLD` to the existing import list from `'../../native/audio-helper-linux.mjs'` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: FAIL — `peakAmplitude is not a function` (or an import error naming the missing export).

- [ ] **Step 3: Write minimal implementation**

In `native/audio-helper-linux.mjs`, next to `sumBusFrames` (around line 708):

```js
// A stream that never rises above this is treated as silence. Games publish
// idle streams that emit exact zeros; real audio, even a quiet ambience bed,
// clears this by orders of magnitude. -80 dBFS.
export const SIGNAL_PEAK_THRESHOLD = 1e-4;

export function peakAmplitude(frames) {
  let peak = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const value = frames[i] < 0 ? -frames[i] : frames[i];
    if (value > peak) {
      peak = value;
    }
  }
  return peak;
}

export function hasSignal(peak) {
  return peak > SIGNAL_PEAK_THRESHOLD;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: PASS, and the file's total count grows by 7.

- [ ] **Step 5: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs ds5-bridge/companion/src/main/audio-helper-linux.test.ts
git commit -m "Add peak-amplitude signal detection for app capture probing"
```

---

### Task 2: Gate the mixer on live streams only

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (the `mixReadyBlocks` closure, currently ~line 381)
- Test: `ds5-bridge/companion/src/main/audio-helper-linux.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `readyLiveStreams(streams: Array<{role: string, frames: number}>, blockFrames: number): Array<object>` — returns the live streams when *every* live stream has a full block, otherwise an empty array. Probing streams are always excluded.

This is the bug that makes the current implementation stall: `mixReadyBlocks` waits on `streams.every(...)` across *all* captures, so one stream that never delivers freezes haptics output entirely.

- [ ] **Step 1: Write the failing test**

Append to `src/main/audio-helper-linux.test.ts`:

```ts
describe('readyLiveStreams', () => {
  const stream = (role, frames) => ({ role, frames });

  it('ignores probing streams entirely', () => {
    const live = stream('live', 512);
    const ready = readyLiveStreams([live, stream('probing', 0)], 256);
    expect(ready).toEqual([live]);
  });

  it('is empty when there are no live streams', () => {
    expect(readyLiveStreams([stream('probing', 999)], 256)).toEqual([]);
  });

  it('is empty until every live stream has a full block', () => {
    expect(readyLiveStreams([stream('live', 256), stream('live', 12)], 256)).toEqual([]);
  });

  it('returns every live stream once they all have a full block', () => {
    const a = stream('live', 256);
    const b = stream('live', 300);
    expect(readyLiveStreams([a, b], 256)).toEqual([a, b]);
  });

  it('does not let a stalled probing stream block a ready live stream', () => {
    const live = stream('live', 256);
    expect(readyLiveStreams([live, stream('probing', 0)], 256)).toEqual([live]);
  });
});
```

Add `readyLiveStreams` to the import list.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ds5-bridge/companion && npx vitest run src/main/audio-helper-linux.test.ts`
Expected: FAIL — `readyLiveStreams is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add next to the helpers from Task 1:

```js
// Probing captures are metered, never mixed: a stream still being evaluated
// must not gate output. Live streams are mixed in lockstep so the summed
// blocks stay sample-aligned.
export function readyLiveStreams(streams, blockFrames) {
  const live = streams.filter((stream) => stream.role === 'live');
  if (live.length === 0) {
    return [];
  }
  return live.every((stream) => stream.frames >= blockFrames) ? live : [];
}
```

Then rewrite the `mixReadyBlocks` closure (currently ~line 381) to use it:

```js
  const mixReadyBlocks = () => {
    for (;;) {
      const ready = readyLiveStreams([...appStreams.values()], MIX_BLOCK_FRAMES);
      if (ready.length === 0) {
        return;
      }
      const blocks = ready.map((stream) => stream.take(MIX_BLOCK_FRAMES));
      const output = processor.process(sumBusFrames(blocks));
      if (play.stdin.writable) {
        play.stdin.write(Buffer.from(output.buffer, 0, output.byteLength));
      }
    }
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ds5-bridge/companion && npx vitest run src`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs ds5-bridge/companion/src/main/audio-helper-linux.test.ts
git commit -m "Gate the app-capture mixer on live streams only"
```

---

### Task 3: Probe a new stream before promoting it

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (`startAppStream`, ~line 394)

**Interfaces:**
- Consumes: `peakAmplitude`, `hasSignal` (Task 1); `readyLiveStreams` (Task 2).
- Produces: each entry in the `appStreams` map gains `role: 'probing' | 'live'`. A `dormantUntil` map keyed by the same stream key records when a rejected node may be retried.

Attach every newly seen stream as `probing`. While probing, its audio is metered but not mixed. After `PROBE_WINDOW_MS`, promote it if it carried signal, otherwise kill the capture and mark the node dormant.

- [ ] **Step 1: Add the constants and dormant map**

Immediately after the existing `const appStreams = new Map();` (~line 380), add:

```js
  // How long a new stream is metered before we decide whether it carries the
  // mix. Long enough to survive a gap between game sound effects, short
  // enough that haptics start promptly.
  const PROBE_WINDOW_MS = 750;
  // A rejected stream is retried on a cooldown, because a game can start using
  // a stream it opened silently. Retry fast while nothing is live so haptics
  // pick up quickly, slowly once we already have audio.
  const DORMANT_RETRY_MS = 15000;
  const DORMANT_RETRY_IDLE_MS = 3000;
  // A live capture delivering no bytes at all is broken, not quiet. Drop it so
  // it cannot hold up the lockstep mix.
  const LIVE_STALL_MS = 10000;
  const dormantUntil = new Map();
```

- [ ] **Step 2: Give each stream a role and a probe meter**

In `startAppStream`, replace the `const stream = { ... }` object literal and the `appStreams.set(key, stream);` line with:

```js
    const stream = {
      proc,
      role: 'probing',
      probePeak: 0,
      lastDataAt: Date.now(),
      probeTimer: null,
      get frames() {
        return pending.length / BUS_CHANNELS;
      },
      take(count) {
        const wanted = count * BUS_CHANNELS;
        const block = pending.subarray(0, wanted);
        pending = pending.slice(wanted);
        return block;
      }
    };
    appStreams.set(key, stream);

    stream.probeTimer = setTimeout(() => {
      stream.probeTimer = null;
      if (stream.role !== 'probing') {
        return;
      }
      if (hasSignal(stream.probePeak)) {
        stream.role = 'live';
        process.stderr.write(`status: app-stream-live ${key}\n`);
        return;
      }
      process.stderr.write(`status: app-stream-silent ${key}\n`);
      dormantUntil.set(key, Date.now() + (anyLive() ? DORMANT_RETRY_MS : DORMANT_RETRY_IDLE_MS));
      stream.proc.kill();
    }, PROBE_WINDOW_MS);
```

Add this helper just above `startAppStream`:

```js
  const anyLive = () => [...appStreams.values()].some((stream) => stream.role === 'live');
```

- [ ] **Step 3: Meter while probing, buffer only when live**

Inside `proc.stdout.on('data', ...)`, replace the block from `const bus = busFrames(input, indices);` through the `mixReadyBlocks();` call with:

```js
      const bus = busFrames(input, indices);
      stream.lastDataAt = Date.now();
      if (stream.role === 'probing') {
        const peak = peakAmplitude(bus);
        if (peak > stream.probePeak) {
          stream.probePeak = peak;
        }
        return;
      }
      const merged = new Float32Array(pending.length + bus.length);
      merged.set(pending);
      merged.set(bus, pending.length);
      // Drop the oldest audio rather than let one lagging capture stall the
      // mix and grow the queue without bound.
      pending = merged.length > MAX_LAG_FRAMES * BUS_CHANNELS
        ? merged.slice(merged.length - MAX_LAG_FRAMES * BUS_CHANNELS)
        : merged;
      mixReadyBlocks();
```

- [ ] **Step 4: Clear the probe timer when the capture exits**

Replace the existing `proc.on('exit', ...)` handler with:

```js
    proc.on('exit', () => {
      if (stream.probeTimer) {
        clearTimeout(stream.probeTimer);
        stream.probeTimer = null;
      }
      appStreams.delete(key);
      if (!stopping && appStreams.size === 0) {
        process.stderr.write('status: waiting-for-app\n');
      }
    });
```

- [ ] **Step 5: Verify nothing regressed**

Run: `cd ds5-bridge/companion && npx vitest run src`
Expected: PASS — 852 + the 12 tests added in Tasks 1 and 2.

- [ ] **Step 6: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs
git commit -m "Probe a new app stream before mixing it"
```

---

### Task 4: Honour dormancy and drop stalled live captures

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs` (`syncAppStreams`, ~line 448)

**Interfaces:**
- Consumes: `dormantUntil`, `anyLive`, `LIVE_STALL_MS`, `DORMANT_RETRY_MS`, `DORMANT_RETRY_IDLE_MS` (Task 3).
- Produces: no new exports.

Without this, a rejected stream is re-attached on the very next 2-second poll and probed forever in a loop.

- [ ] **Step 1: Rewrite `syncAppStreams`**

Replace the body of `syncAppStreams` with:

```js
  const syncAppStreams = async () => {
    if (stopping) {
      return;
    }
    let nodes = [];
    try {
      nodes = matchAppStreamNodes(await pwDump(), appSource);
    } catch (error) {
      process.stderr.write(`app node poll failed: ${error.message}\n`);
    }
    const now = Date.now();
    const wanted = new Map(nodes.map((node) => [`${nodeProps(node)['object.serial'] ?? node.id}`, node]));

    for (const [key, stream] of appStreams) {
      if (!wanted.has(key)) {
        stream.proc.kill();
        continue;
      }
      // A live capture that has gone completely quiet on stdout is wedged, not
      // silent: silence still arrives as zero-filled buffers.
      if (stream.role === 'live' && now - stream.lastDataAt > LIVE_STALL_MS) {
        process.stderr.write(`status: app-stream-stalled ${key}\n`);
        dormantUntil.set(key, now + DORMANT_RETRY_IDLE_MS);
        stream.proc.kill();
      }
    }

    // Forget cooldowns for streams the app has closed, so a restarted game is
    // probed immediately rather than serving out a stale timer.
    for (const key of [...dormantUntil.keys()]) {
      if (!wanted.has(key)) {
        dormantUntil.delete(key);
      }
    }

    for (const [key, node] of wanted) {
      if (appStreams.has(key)) {
        continue;
      }
      const retryAt = dormantUntil.get(key);
      if (retryAt !== undefined && now < retryAt) {
        continue;
      }
      dormantUntil.delete(key);
      startAppStream(key, node);
    }
    attachTimer = setTimeout(syncAppStreams, APP_POLL_MS);
  };
```

- [ ] **Step 2: Verify nothing regressed**

Run: `cd ds5-bridge/companion && npx vitest run src`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add ds5-bridge/companion/native/audio-helper-linux.mjs
git commit -m "Re-probe dormant app streams on a cooldown and drop stalled captures"
```

---

### Task 5: Verify against the real game and measure the saving

**Files:** none modified. This task is verification only — do not skip it, the previous fix passed unit tests and still failed on hardware.

**Prerequisites:** DualSense connected, `vdsd` running, Marvel Rivals (or any Proton/Unreal title) running and **producing audio with the game window focused** — most titles mute when unfocused, which is what made this bug hard to reproduce.

- [ ] **Step 1: Select the app as the haptics source**

In OpenDS5 → Audio Haptics, choose the game from the source picker (not "System").

- [ ] **Step 2: Confirm exactly one capture survives probing**

```bash
pgrep -af 'pw-record' | grep -v zsh
```

Expected: **one** `pw-record` for the app (plus the unrelated `--volume-guard` helper). Before this change there was one per published stream — three for Marvel Rivals.

- [ ] **Step 3: Confirm the promoted stream is the one carrying audio**

```bash
pgrep -af 'audio-helper-linux.mjs --source' # note the --haptics-app-process-id
pw-dump | python3 -c "
import json,sys
d=json.load(sys.stdin)
for o in d:
    if o.get('type')!='PipeWire:Interface:Node': continue
    p=(o.get('info') or {}).get('props') or {}
    if p.get('media.class')=='Stream/Output/Audio':
        print(o['id'], p.get('object.serial'), p.get('application.name'), p.get('media.name'))
"
```

Then capture each candidate serial for 5s and confirm the helper attached to the one with signal:

```bash
timeout 5 pw-record --raw -P '{ target.object = <SERIAL> }' --format f32 --rate 48000 \
  --channels 2 --channel-map FL,FR /tmp/probe.raw
python3 -c "
import struct,math
d=open('/tmp/probe.raw','rb').read(); n=len(d)//8
peak=max(max(abs(x) for x in struct.unpack_from('<ff',d,i*8)) for i in range(0,n,7))
print('peak', peak, 'AUDIO' if peak>1e-4 else 'silent')
"
```

Expected: the serial the helper targets is the one reporting `AUDIO`.

- [ ] **Step 4: Confirm haptics actually fire**

Play the game with bass-heavy audio. Expected: the grips respond. This is the acceptance criterion — unit tests cannot prove it.

- [ ] **Step 5: Measure the saving**

```bash
for p in $(pgrep -x pw-record); do ps -o pid,%cpu,rss,comm -p $p | tail -1; done
```

Expected: one capture at roughly 0.6% CPU / ~19 MB RSS. Record the numbers in the commit message. The pre-change baseline for Marvel Rivals was three captures (~1.8% of a core, ~58 MB).

- [ ] **Step 6: Confirm recovery after the game restarts its audio**

Alt-tab away (the game mutes), wait ~20 s, alt-tab back and resume play. Expected: haptics resume within a few seconds without restarting OpenDS5 — `DORMANT_RETRY_IDLE_MS` drives the fast re-probe when nothing is live.

- [ ] **Step 7: Commit the verification notes**

```bash
git commit --allow-empty -m "Verify app-capture probing on Marvel Rivals

One pw-record in steady state (<measured CPU>/<measured RSS>), attached to
serial <N>, the only stream carrying signal. Haptics confirmed by hand.
Recovery after an unfocused-mute gap confirmed."
```

---

## Notes for the implementer

- **Do not "fix" this by picking the highest-numbered stream, the newest node, or the one linked to a particular sink.** All of those were checked against the live graph and none separate the audio-carrying stream from the silent ones. Sampling the data is the only reliable discriminator.
- **`state: running` does not mean "producing audio."** It means the stream is active. All three Marvel Rivals streams report `running` while two emit pure zeros. This is exactly what the original `matchAppStreamNode` heuristic got wrong.
- **Silence on a live stream is fine and must not demote it.** Demoting on silence would leave a gap every time a game goes quiet. Only a stream delivering *no bytes at all* (`LIVE_STALL_MS`) is dropped.
- If `PROBE_WINDOW_MS` proves too short for a game with sparse audio, raise it before weakening `SIGNAL_PEAK_THRESHOLD` — a lower threshold risks promoting a dithered-but-silent stream, which reintroduces the original bug in a subtler form.
