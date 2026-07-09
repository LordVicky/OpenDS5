# Resizable Window — Design

**Date:** 2026-07-09
**Scope:** `ds5-bridge/companion` (Electron main process, minor renderer CSS)

## Goal

Replace the fixed-size main window with a freely resizable one, while keeping
the existing UI Scale setting working as-is (zoom factor for content size).

## Current behavior

- `createWindow` creates a frameless `BrowserWindow` with `width = minWidth =
  maxWidth` and `height = minHeight = maxHeight` derived from
  `BASE_WINDOW_WIDTH/HEIGHT (1120×630) × uiScalePercent`, plus
  `resizable: false`, `maximizable: false`, `fullscreenable: false`.
- `applyWindowScale` re-locks min/max/bounds and calls `setResizable(false)`
  on every scale change.
- The renderer layout is viewport-based (`100vw`/`100vh`), so it already
  adapts to arbitrary window sizes.

## New behavior

### Window creation

- `resizable: true`, `maximizable: true`. `fullscreenable` stays `false`.
- No `maxWidth`/`maxHeight`.
- Minimum size = scaled base size (`1120×630 × scale`) so the layout never
  drops below its designed dimensions. At 125% scale the zoomed content
  needs the larger minimum, so the minimum tracks the scale.
- Initial bounds come from persisted state (below), falling back to the
  scaled default, centered.

### UI Scale changes (`applyWindowScale`)

- Still sets the zoom factor.
- Updates only the **minimum** size to the new scaled base size.
- If the current window is smaller than the new minimum, grows it just
  enough (clamped to the display work area); otherwise leaves the user's
  size and position untouched.
- No longer calls `setMaximumSize`, `setResizable(false)`, or
  `setMaximizable(false)`.

### Bounds persistence

- A small JSON file (`window-state.json`) in `app.getPath('userData')`
  stores `{ x, y, width, height, maximized }`.
- Written debounced (~500 ms) on `resize`/`move`, and flushed on window
  close. Corrupt or missing file → defaults.
- On launch, restored bounds are clamped to the matching display's work
  area and to the scaled minimum; if the saved position is fully
  off-screen, fall back to centered defaults.
- Deliberately **not** stored in the bridge daemon settings — window
  geometry is a UI-process concern.

### Frameless resize edges

- With `resizable: true` Electron provides edge/corner resize handles on
  frameless windows. Verify the titlebar's `-webkit-app-region: drag`
  region does not swallow the top resize edge; if it does, add a small
  (~4 px) `no-drag` inset strip at the top edge in the renderer CSS.

## Testing

- Unit tests (existing main-process test style):
  - bounds clamp/restore logic (off-screen, oversized, corrupt state,
    missing file);
  - scale-change behavior (grows only when below new minimum, preserves
    size otherwise).
- Manual/hardware check on the user's Wayland setup: drag, edge resize,
  maximize/unmaximize, scale change at 75/100/125%, restart restores size.

## Out of scope

- Removing or redesigning the UI Scale setting.
- Responsive layout redesign (viewport-based layout already adapts).
- Fullscreen support.
