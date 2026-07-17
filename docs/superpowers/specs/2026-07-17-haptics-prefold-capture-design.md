# Pre-fold Per-App Haptics Capture — Design

Date: 2026-07-17
Branch: `feature/haptics-prefold-capture` (off `dev`)
Status: approved by user (LFE weight hardcoded at 1.0, no new UI)

## Problem

Audio Haptics on Linux always captures the default sink's monitor
(`audio-helper-linux.mjs`, render-loopback path). That signal is
post-fold-down: when a game renders 5.1/7.1 and the user listens on stereo
headphones, PipeWire's mixdown attenuates or drops the LFE channel — the
channel sound designers use for exactly the content haptics should convey.
It also mixes every app's audio together (Discord, music) into the haptics.

The engine already sends `--haptics-app-process-id`,
`--haptics-app-process-path`, and `--haptics-app-executable` when the user
picks an app in the Audio Haptics source picker (`audio-helper.ts`
startInternal), but the Linux helper ignores them.

## Goals

1. When an app source is selected, capture that app's own
   `Stream/Output/Audio` node pre-fold, preserving its native channel
   layout (stereo, 5.1, 7.1, …).
2. Sum channels deliberately: `left = FL + 0.5×FC + 1.0×LFE`,
   `right = FR + 0.5×FC + 1.0×LFE`. Rears/sides are ignored (they rarely
   carry bass; excluding them also avoids re-inviting the fold-down
   feedback loop fixed in 02792b1). Stereo streams reduce exactly to
   today's FL+FR behavior.
3. Per-app isolation as a side benefit even for stereo games.
4. No app selected → current sink-monitor path, byte-for-byte unchanged.

Non-goals: LFE emphasis UI (deferred — hardcode weight 1.0; revisit after
hardware tuning shows a boost is distinguishable), Windows changes,
forcing games to render surround (user does that in game settings).

## Design

### Helper: app-source capture (`audio-helper-linux.mjs`)

- `runRenderLoopbackHaptics` reads the three `--haptics-app-*` flags.
- **Node resolution:** poll `pw-dump` (2 s cadence, same as the existing
  session monitor) for a `Stream/Output/Audio` node whose
  `application.process.id` matches; fall back to matching
  `application.process.binary` against the executable name. Prefer a
  `running` node when several match.
- **Format discovery:** read the node's negotiated channel count and
  position map from its `Format` param in the pw-dump output. If the
  format cannot be determined, assume stereo FL,FR.
- **Capture:** spawn `pw-record --target <node id/name>` with the stream's
  native `--channels`/`--channel-map` (no `stream.capture.sink`, since the
  target is an output stream, not a sink monitor).
- **Hot-attach lifecycle:** helper starts in "waiting" state and emits
  `status: recording-started` on first attach (the app already tolerates
  the 8 s startup window). If the record process exits or the node
  vanishes (game recreates its stream on level load), reap the process,
  return to polling, re-attach when the node reappears. Playback side
  (`pw-play` to the bridge sink) persists across re-attaches.
- No app flags present → existing sink-monitor code path runs unchanged.

### Processor: layout-aware summing (`HapticsProcessor`)

- `process()` gains knowledge of the input layout: frame stride and the
  indices of FL, FR, FC, LFE derived from the negotiated channel map
  (set when a capture attaches; re-set on re-attach).
- Per frame: `left = FL + 0.5×FC + LFE`, `right = FR + 0.5×FC + LFE`
  (missing channels contribute 0). Downstream pipeline (low-pass,
  envelope, gate, gain, tanh) unchanged. Output stays 4ch with haptics on
  channels 3–4.
- Sink-monitor path keeps the current fixed 4ch FL,FR,RL,RR input with
  fronts only — identical numerics to today.

### Engine / UI

No changes. The app picker, flag plumbing, and Audio Haptics card already
exist; this makes the Linux helper honor what they send.

## Error handling

- App selected but never appears: helper stays in waiting state, keeps
  polling; no audio flows (correct — the chosen source is silent/absent).
  Existing `status:` lines on stderr report state transitions for logs.
- `pw-dump` failure during polling: log to stderr, retry next tick.
- Malformed/unsupported channel map: fall back to stereo interpretation
  of the first two channels.

## Testing

- Unit (helper is plain .mjs; tests colocated with the existing companion
  test suite pattern):
  - node matching: pid hit, binary fallback, multiple matches, no match;
  - channel-map parsing → FL/FR/FC/LFE indices for stereo, 5.1, 7.1, and
    an unknown map (stereo fallback);
  - summing math for stereo (identical to current fronts-only) and 5.1
    (FC/LFE weights applied);
  - hot-attach state machine with mocked pw-dump/process events.
- Hardware verification:
  - surround-rendering game forced to 5.1: LFE-driven punch present while
    listening on stereo headphones; per-app isolation (Discord/music do
    not drive haptics);
  - regression: sink-monitor path with 3.5 mm headset shows no feedback
    buzz (02792b1 fix intact);
  - stream-restart mid-game (level load / game restart) re-attaches.

## Caveats

- Games must actually render surround; PipeWire may offer stereo when the
  default output is stereo, so users force 5.1/7.1 in game settings.
- LFE weight (1.0) and the FC weight (0.5) get sanity-tuned during
  hardware verification; a Normal/Boosted toggle is a small follow-up if
  tuning shows a boost is worth exposing.
