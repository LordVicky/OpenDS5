# Volume Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Per-feature "Volume Sync" toggles (Audio Haptics + HD Haptics) choosing whether haptics follow the listening volume; both default ON (historical behavior).

**Architecture:** Audio Haptics sync gates the existing `volumeCompensation` inside the Linux helper (new CLI flag + 7th `haptics-config` field). HD Haptics sync-off runs a new helper mode `--volume-guard` that pins the bridge sink's channels 3–4 at unity via `pw-cli set-param`, spawned/killed by the Electron main process. UI: one toggle row per card following existing card toggle patterns.

**Tech Stack:** Node ESM helper (.mjs), Electron main (TypeScript), React renderer, vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-volume-sync-design.md`

## Global Constraints

- Defaults: `audioReactiveHapticsVolumeSync: true`, `hapticsVolumeSync: true`. Missing/garbage stored values normalize to `true`.
- Sync ON = haptics follow volume (compensation off / no guard) — exactly pre-f41b141 behavior for the audio path.
- Helper stays a single file (`ds5-bridge/companion/native/audio-helper-linux.mjs`); Windows helper untouched.
- `haptics-config` stdin line grows to 7 fields: `haptics-config <gain> <bassFocus> <response> <attack> <release> <volumeSync 1|0>`; absent 7th field → sync ON.
- Guard pins ONLY channels 3–4 (indices 2,3) to 1.0; channels 1–2 must keep the user's value.
- Tests from `ds5-bridge/companion`; run full `npx vitest run src` before each commit.
- Commit locally only, never push, no Co-Authored-By/Generated-with trailers, never `git add -A`.

---

### Task 1: Settings store + helper volume-sync gating

**Files:**
- Modify: `ds5-bridge/companion/src/main/settings-store.ts` (add `audioReactiveHapticsVolumeSync: true` and `hapticsVolumeSync: true` to defaults near the other `audioReactiveHaptics*` keys; add boolean normalization following the store's existing boolean pattern)
- Modify: `ds5-bridge/companion/src/shared/types.ts` (the settings type carrying `audioReactiveHapticsEnabled` gains both booleans)
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs`
- Test: `ds5-bridge/companion/src/main/settings-store.test.ts` (follow existing normalizer tests), `ds5-bridge/companion/src/main/audio-helper-linux.test.ts`

**Interfaces:**
- Produces: settings keys `audioReactiveHapticsVolumeSync`, `hapticsVolumeSync` (booleans, default true). Helper: `--haptics-volume-sync 1|0` CLI flag; `HapticsProcessor.setVolumeSync(boolean)`; 7-field `haptics-config` line; when sync ON the applied output compensation is exactly 1 regardless of polled volume.

- [ ] **Step 1 (TDD):** settings-store tests: both keys default true; stored `false` survives; garbage (string/number/undefined) → true. Helper tests: `readHapticsConfig` includes `volumeSync` (flag `--haptics-volume-sync 0` → false, absent → true); a processor with `setOutputCompensation(6)` then `setVolumeSync(true)` produces output identical to compensation 1; `setVolumeSync(false)` restores the 6× (clamped) output; `haptics-config 100 balanced balanced balanced balanced 0` parsing accepted at 7 fields (extend the existing stdin-parse branch condition and test via exported pieces, matching how existing config parsing is tested).
- [ ] **Step 2:** Run targeted tests, verify RED.
- [ ] **Step 3:** Implement: store defaults + normalizers; helper — `readHapticsConfig` reads the flag; `HapticsProcessor` gains `this.volumeSync = true`, `setVolumeSync(v)`, and applies `const comp = this.volumeSync ? 1 : this.outputCompensation;` in `process()`; the stdin `haptics-config` handler passes `parts[6] === undefined ? true : parts[6] === '1'` to `setVolumeSync` and keeps working with 6 fields; `runRenderLoopbackHaptics` calls `processor.setVolumeSync(...)` from the CLI flag at startup (volume polling keeps running either way — cheap, and toggling OFF then applies instantly).
- [ ] **Step 4:** Targeted tests GREEN; full `npx vitest run src` passes.
- [ ] **Step 5:** Commit `Add Volume Sync gating to the Linux audio helper and settings store`.

### Task 2: Engine plumbing (audio-helper.ts)

**Files:**
- Modify: `ds5-bridge/companion/src/main/audio-helper.ts` (`SystemAudioHapticsConfig` gains `volumeSync: boolean`; `normalizeSystemAudioHapticsConfig` defaults it true; `startInternal` appends `'--haptics-volume-sync', config.volumeSync ? '1' : '0'`; `setConfig`'s stdin line becomes the 7-field form)
- Modify: whatever main-process call site builds `SystemAudioHapticsConfig` from settings (grep `gainPercent: settings.audioReactiveHapticsGainPercent` / `audioReactiveHapticsBassFocus`) — pass `volumeSync: settings.audioReactiveHapticsVolumeSync`.
- Test: `ds5-bridge/companion/src/main/audio-helper.test.ts` (follow existing arg/stdin assertions; update every existing fixture config to include `volumeSync`).

**Interfaces:**
- Consumes: Task 1's settings keys and helper flag/stdin contract.
- Produces: engine always sends the flag and the 7-field config line.

- [ ] **Step 1 (TDD):** extend existing audio-helper tests: spawn args include the flag both ways; `setConfig` line ends with ` 1`/` 0`.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN + full suite. **Step 5:** Commit `Plumb Audio Haptics Volume Sync through the engine`.

### Task 3: HD volume guard (helper mode + main lifecycle)

**Files:**
- Modify: `ds5-bridge/companion/native/audio-helper-linux.mjs`: export
```js
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
```
  plus `runVolumeGuard()`: every 2000 ms, `requireBridgeSink()` on first tick then re-find on failure; read `channelVolumes` from the sink node's `Props` param (pw-dump object: `info.params.Props?.[0]?.channelVolumes`); if `pinnedChannelVolumes` returns non-null, `execFile('pw-cli', ['set-param', `${sink.id}`, 'Props', `{ channelVolumes: [ ${vols.join(', ')} ] }`])`. Errors → stderr, retry next tick. `stop` stdin line / SIGTERM / SIGINT exit cleanly (mirror `runMonitorAudioSessions`). Dispatch in `main()` via `--volume-guard`.
- Modify: Electron main — a small `VolumeGuard` wrapper next to the existing helper-lifecycle code (grep `mic-keepalive-only` / `helperLaunch` in `src/main` for the established spawn pattern): start when settings say `hapticsVolumeSync === false` (on boot and on settings change), stop on toggle ON and app quit. Linux only (`process.platform === 'linux'`).
- Test: helper — `pinnedChannelVolumes` (short array → null, already pinned → null, `[0.3,0.3,0.3,0.3]` → `[0.3,0.3,1,1]`, 6ch preserved tail); main wrapper — start/stop decisions per settings (mock spawn, follow existing helper lifecycle tests).

- [ ] **Step 1 (TDD)** → **Step 2 RED** → **Step 3 implement** → **Step 4 GREEN + full suite** → **Step 5:** Commit `Pin HD haptic channels at unity when Volume Sync is off`.

### Task 4: UI toggles

**Files:**
- Modify: `ds5-bridge/companion/src/renderer/App.tsx` — one "Volume Sync" toggle row on the Audio Haptics card (near the gain slider controls, pattern-match the card's existing toggle rows) bound to `audioReactiveHapticsVolumeSync`, and one on the HD Haptics card bound to `hapticsVolumeSync`. Label: `Volume Sync`; description text: `Haptics follow the listening volume`. Follow the exact markup/state/IPC-update pattern of a neighboring boolean toggle on the same card (do not invent new styles).
- Test: `ds5-bridge/companion/src/renderer/app-behavior.test.ts` if it covers card toggles (follow an existing toggle's test); otherwise rely on typecheck + suite.

- [ ] **Step 1:** implement both rows. **Step 2:** full `npx vitest run src` + `tsc` build passes (`npm run build:app` compiles). **Step 3:** Commit `Add Volume Sync toggles to the haptics cards`.

### Task 5: Verification

- [ ] Full suite `npm run test:companion`; rebuild AppImage (`npm run installer:linux`), deploy to `~/Applications/OpenDS5.AppImage`.
- [ ] Hardware (user): Audio Haptics sync ON → rumble fades with volume knob; OFF → constant. HD card sync OFF → game haptics constant while ears follow the knob (guard re-pins within ~2 s of a volume change); ON → today's coupled behavior.
