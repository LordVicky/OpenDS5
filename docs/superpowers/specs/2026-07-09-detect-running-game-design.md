# Detect Running Game — Design

**Date:** 2026-07-09
**Status:** Approved
**Branch:** `adaptive-trigger-profiles`

## Problem

Trigger profiles auto-activate by matching `processNames` against `/proc`, but
authoring those names by hand is error-prone (e.g.
`NieR Replicant ver.1.22474487139.exe` — users mistype it and the profile
never matches). Launcher-library indexing (Steam/Heroic/.desktop) was
considered and deferred; the chosen v1 is a **"Detect running game" button**:
launch the game, click detect, pick the process — the stored name is exactly
what the matcher will see.

## Goals

- One-click authoring of process match names from live processes.
- Guaranteed match consistency: candidates use the same name normalization as
  `GameWatcher`'s matcher (lowercased comm + argv0 basename with backslash
  normalization).
- Launcher/distro-agnostic: works for anything that runs.

## Non-goals

- Steam/Heroic/.desktop library search (future feature).
- Background process monitoring or new watchers; detection is a one-shot
  read-only scan on button click.

## Design

### Candidate scanner (main process)

New function `listCandidateGameProcesses()` in `src/main/game-watcher.ts`
(alongside `listProcProcesses`, sharing its `/proc` reading approach) returns
ranked candidates:

```ts
export interface GameProcessCandidate {
  name: string;              // normalized: lowercase basename, matcher-compatible
  kind: 'proton' | 'game-path' | 'other';
}
export function listCandidateGameProcesses(
  readProc?: () => RawProcessInfo[]   // injectable for tests
): GameProcessCandidate[];
```

For each pid: read `comm`, `cmdline` (argv0 → backslash-normalized basename),
and `exe` symlink target (best-effort; may fail without permissions — treat as
unknown path).

Ranking / filtering:

1. **`proton`** — names ending in `.exe`, excluding a wine-plumbing blocklist:
   `wineserver`, `services.exe`, `svchost.exe`, `explorer.exe`, `winedevice.exe`,
   `plugplay.exe`, `rpcss.exe`, `tabtip.exe`, `steam.exe`, `steamwebhelper.exe`,
   `wine`, `wine64`, `wine-preloader`, `wine64-preloader`, `start.exe`,
   `conhost.exe`, `crashhandler.exe`, `easyanticheat*` (prefix), `battleye*`
   (prefix), `iscriptevaluator.exe`, `upplayservice.exe`.
2. **`game-path`** — non-`.exe` processes whose exe path contains
   `steamapps/common`, `/games/`, `heroic`, `lutris`, or `bottles`
   (case-insensitive).
3. Everything else is excluded. If tiers 1+2 are both empty, fall back to
   `kind: 'other'`: the user's own processes excluding a system blocklist
   (kernel threads — empty cmdline, plus common daemons/shells:
   `systemd*`, `bash`, `zsh`, `sh`, `dbus*`, `pipewire*`, `wireplumber`,
   `Xwayland`, common browsers `firefox`/`chrome`/`chromium`, `electron`, and
   the companion app itself), capped at 30, alphabetical.

Candidates are deduped by name; tier order is preserved (proton first, then
game-path, each alphabetical).

### IPC

`bridge:listCandidateGameProcesses` (invoke, no args) →
`GameProcessCandidate[]`. Registered in `main.ts` with the other `bridge:*`
handlers; preload method `listCandidateGameProcesses()`; ipc-contract test
entries. Read-only; no engine interaction.

### UI (Trigger Profiles editor, Identity & Matching group)

A **"Detect running game"** button beside the process-names input. On click:
fetch candidates, show a popover list (existing dropdown/popover styling)
with the name and a kind hint ("Proton" / "game path" / nothing for other).
Clicking a candidate appends it to the draft's process names (deduped,
already lowercase); the popover stays open so multiple can be added; closes
on outside click/Escape. Empty state text: "No game detected — is it
running?" A loading state is unnecessary (scan is ~ms) but the button
disables while the invoke is in flight.

### Error handling

`/proc` read failures per-pid are ignored (process exited mid-scan); a total
failure returns `[]` → empty state in the popover. The IPC handler never
throws to the renderer.

### Testing

- Unit tests for `listCandidateGameProcesses` with an injected `readProc`:
  blocklist filtering, `.exe` tier ordering, game-path tier detection,
  fallback tier when no games found, dedupe, cap.
- ipc-contract test entries for the new channel.
- Renderer helper test if a pure helper is extracted (e.g. merging a picked
  candidate into the draft's process names).
