# Volume Sync — Design

Date: 2026-07-17
Branch: `feature/haptics-prefold-capture` (continues the pre-fold capture work)
Status: approved by user (defaults: both toggles ON)

## Problem

Haptics on Linux are delivered as audio through the bridge sink, so the
sink's volume scales them: game HD haptics (channels 3–4 of the game's own
stream) and the Audio Haptics helper output both fade with the listening
volume. Tonight's `volumeCompensation` work decoupled the Audio Haptics
path unconditionally — but the user sometimes *wants* volume-coupled
haptics. Make coupling a per-feature choice.

## Feature: "Volume Sync" toggles

Two independent toggles, both **default ON** (ON = today's historical
behavior: haptics follow the listening volume).

1. **Audio Haptics card → Volume Sync**
   - ON: helper output follows sink volume (output compensation disabled,
     factor fixed at 1).
   - OFF: helper compensates by the inverse sink volume (the mechanism
     shipped in f41b141), making synthesized haptics volume-independent.
   - Setting: `audioReactiveHapticsVolumeSync: boolean` (default true).
   - Plumbing: new helper CLI flag `--haptics-volume-sync 1|0` and a 7th
     field on the live `haptics-config` stdin line, so toggling applies
     without restarting capture.

2. **HD Haptics card → Volume Sync**
   - ON: nothing runs; sink volume scales the game's haptic channels as
     today.
   - OFF: a volume guard pins the bridge sink's haptic channels (3–4) at
     unity while channels 1–2 keep tracking the user's volume. Implemented
     as a new helper mode `--volume-guard`: every 2 s read the bridge
     sink's `Props.channelVolumes`; if channels 3–4 differ from 1.0,
     rewrite them to 1.0 via `pw-cli set-param <sink id> Props`, leaving
     channels 1–2 untouched. Desktop volume changes rewrite all four
     channels, so drift is corrected within one poll (brief dip accepted).
   - Setting: `hapticsVolumeSync: boolean` (default true).
   - Lifecycle: the app's main process spawns the guard while
     `hapticsVolumeSync === false` (regardless of hapticsEnabled — classic
     rumble-over-audio also benefits), kills it when toggled back ON or on
     quit. Linux only; Windows is untouched.

## UI

One toggle row on each card, labeled "Volume Sync", subtitle
"Haptics follow the listening volume". Follows the cards' existing toggle
row pattern. No other UI.

## Error handling

- Guard: pw-cli/pw-dump failures log to stderr and retry next tick; sink
  absent → keep polling (controller may reconnect).
- Helper: unknown/absent 7th config field defaults to sync ON (safe,
  historical behavior).

## Testing

- Settings store: both booleans normalize (garbage → default true).
- Helper: volume-sync flag parsing; compensation factor forced to 1 when
  sync ON; live toggle via 7-field haptics-config line; guard's
  channelVolumes patch computation as an exported pure function
  (`pinnedChannelVolumes(current) -> array | null` — null when already
  pinned, no-op).
- Engine: config type/args/stdin line carry the new field.
- Hardware: toggle each and confirm feel changes with the volume knob.
