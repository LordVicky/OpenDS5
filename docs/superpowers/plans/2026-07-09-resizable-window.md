# Resizable Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DS5 Bridge companion window freely resizable (with persisted bounds) instead of hard-locked to the scaled base size.

**Architecture:** A new pure module `src/main/window-state.ts` owns bounds clamping/persistence logic (fully unit-testable). `main.ts` is rewired to create a resizable window, restore saved bounds on launch, save them debounced on resize/move, and update only the *minimum* size on UI Scale changes. A small CSS tweak keeps the frameless top resize edge usable.

**Tech Stack:** Electron (main process, TypeScript), vitest. Spec: `docs/superpowers/specs/2026-07-09-resizable-window-design.md`.

## Global Constraints

- Base window size stays `BASE_WINDOW_WIDTH = 1120`, `BASE_WINDOW_HEIGHT = 630`; minimum size is always `base × uiScalePercent/100`.
- UI Scale keeps setting the zoom factor exactly as today.
- `fullscreenable` stays `false`.
- Window geometry is persisted to `window-state.json` in `app.getPath('userData')` — never in bridge daemon settings.
- All commands run from `ds5-bridge/companion/`. Test with `npx vitest run <file>`.
- Existing tests must keep passing: `npm run test:companion`.

---

### Task 1: `window-state.ts` pure module (clamp + persistence)

**Files:**
- Create: `src/main/window-state.ts`
- Test: `src/main/window-state.test.ts`

**Interfaces:**
- Produces (used by Task 2):
  ```ts
  export interface WindowState { x: number; y: number; width: number; height: number; maximized: boolean }
  export interface Rect { x: number; y: number; width: number; height: number }
  // Clamps saved bounds into workArea and to minimums; returns null if state is unusable (caller falls back to defaults).
  export function resolveWindowBounds(saved: WindowState | null, workArea: Rect, minWidth: number, minHeight: number): Rect | null;
  // Grows bounds (keeping position, shifted to stay inside workArea) so width/height >= minimums; returns input unchanged when already large enough.
  export function growBoundsToMinimum(bounds: Rect, workArea: Rect, minWidth: number, minHeight: number): Rect;
  export function loadWindowState(userDataPath: string): WindowState | null;   // reads <userDataPath>/window-state.json
  export function saveWindowState(userDataPath: string, state: WindowState): void;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/main/window-state.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  growBoundsToMinimum,
  loadWindowState,
  resolveWindowBounds,
  saveWindowState,
  type WindowState
} from './window-state';

const workArea = { x: 0, y: 0, width: 2560, height: 1400 };
const saved: WindowState = { x: 100, y: 80, width: 1300, height: 800, maximized: false };

describe('resolveWindowBounds', () => {
  it('returns saved bounds unchanged when they fit', () => {
    expect(resolveWindowBounds(saved, workArea, 1120, 630)).toEqual({ x: 100, y: 80, width: 1300, height: 800 });
  });

  it('returns null when there is no saved state', () => {
    expect(resolveWindowBounds(null, workArea, 1120, 630)).toBeNull();
  });

  it('clamps oversized bounds to the work area', () => {
    const huge: WindowState = { ...saved, x: -50, y: -50, width: 4000, height: 3000 };
    expect(resolveWindowBounds(huge, workArea, 1120, 630)).toEqual({ x: 0, y: 0, width: 2560, height: 1400 });
  });

  it('enforces the scaled minimum size', () => {
    const tiny: WindowState = { ...saved, width: 400, height: 300 };
    const result = resolveWindowBounds(tiny, workArea, 1120, 630);
    expect(result).toMatchObject({ width: 1120, height: 630 });
  });

  it('returns null when saved bounds are fully off-screen', () => {
    const offScreen: WindowState = { ...saved, x: 10_000, y: 10_000 };
    expect(resolveWindowBounds(offScreen, workArea, 1120, 630)).toBeNull();
  });

  it('moves partially off-screen bounds back inside the work area', () => {
    const partial: WindowState = { ...saved, x: 2400, y: 1300 };
    const result = resolveWindowBounds(partial, workArea, 1120, 630);
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.x + r.width).toBeLessThanOrEqual(workArea.x + workArea.width);
    expect(r.y + r.height).toBeLessThanOrEqual(workArea.y + workArea.height);
  });
});

describe('growBoundsToMinimum', () => {
  it('returns bounds unchanged when already at least the minimum', () => {
    const bounds = { x: 10, y: 10, width: 1300, height: 800 };
    expect(growBoundsToMinimum(bounds, workArea, 1120, 630)).toEqual(bounds);
  });

  it('grows undersized bounds and keeps them inside the work area', () => {
    const bounds = { x: 2000, y: 1100, width: 840, height: 470 };
    const result = growBoundsToMinimum(bounds, workArea, 1120, 630);
    expect(result.width).toBe(1120);
    expect(result.height).toBe(630);
    expect(result.x + result.width).toBeLessThanOrEqual(workArea.x + workArea.width);
    expect(result.y + result.height).toBeLessThanOrEqual(workArea.y + workArea.height);
  });
});

describe('load/saveWindowState', () => {
  let dir: string;
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips state through window-state.json', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds5-window-state-'));
    saveWindowState(dir, saved);
    expect(loadWindowState(dir)).toEqual(saved);
  });

  it('returns null for a missing file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds5-window-state-'));
    expect(loadWindowState(dir)).toBeNull();
  });

  it('returns null for corrupt or malformed JSON', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds5-window-state-'));
    fs.writeFileSync(path.join(dir, 'window-state.json'), '{not json');
    expect(loadWindowState(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'window-state.json'), JSON.stringify({ x: 'nope' }));
    expect(loadWindowState(dir)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/window-state.test.ts`
Expected: FAIL — cannot resolve `./window-state`.

- [ ] **Step 3: Implement the module**

```ts
// src/main/window-state.ts
import fs from 'node:fs';
import path from 'node:path';

export interface Rect { x: number; y: number; width: number; height: number }
export interface WindowState extends Rect { maximized: boolean }

const WINDOW_STATE_FILE = 'window-state.json';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampRectToWorkArea(bounds: Rect, workArea: Rect, minWidth: number, minHeight: number): Rect {
  const width = Math.min(Math.max(bounds.width, minWidth), workArea.width);
  const height = Math.min(Math.max(bounds.height, minHeight), workArea.height);
  const x = Math.round(Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width)));
  const y = Math.round(Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height)));
  return { x, y, width: Math.round(width), height: Math.round(height) };
}

export function resolveWindowBounds(
  saved: WindowState | null,
  workArea: Rect,
  minWidth: number,
  minHeight: number
): Rect | null {
  if (!saved) {
    return null;
  }
  const fullyOffScreen = saved.x >= workArea.x + workArea.width
    || saved.y >= workArea.y + workArea.height
    || saved.x + saved.width <= workArea.x
    || saved.y + saved.height <= workArea.y;
  if (fullyOffScreen) {
    return null;
  }
  return clampRectToWorkArea(saved, workArea, minWidth, minHeight);
}

export function growBoundsToMinimum(bounds: Rect, workArea: Rect, minWidth: number, minHeight: number): Rect {
  if (bounds.width >= minWidth && bounds.height >= minHeight) {
    return bounds;
  }
  return clampRectToWorkArea(bounds, workArea, minWidth, minHeight);
}

export function loadWindowState(userDataPath: string): WindowState | null {
  try {
    const raw = fs.readFileSync(path.join(userDataPath, WINDOW_STATE_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)
      || !isFiniteNumber(candidate.width) || !isFiniteNumber(candidate.height)) {
      return null;
    }
    return {
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
      maximized: candidate.maximized === true
    };
  } catch {
    return null;
  }
}

export function saveWindowState(userDataPath: string, state: WindowState): void {
  try {
    fs.writeFileSync(path.join(userDataPath, WINDOW_STATE_FILE), JSON.stringify(state));
  } catch {
    // Best-effort persistence; losing geometry must never crash the app.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/window-state.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/window-state.ts src/main/window-state.test.ts
git commit -m "feat: add window-state module for resizable window bounds"
```

---

### Task 2: Rewire `main.ts` for a resizable window

**Files:**
- Modify: `src/main/main.ts` (imports; `applyWindowScale` ~line 127; `createWindow` ~line 390; startup at `app.whenReady` ~line 1266)
- Test: `src/main/main-window-behavior.test.ts` (add a new `it` block; source-inspection style)

**Interfaces:**
- Consumes from Task 1: `loadWindowState`, `saveWindowState`, `resolveWindowBounds`, `growBoundsToMinimum`, `WindowState`.
- Produces: no new exports; window behavior only.

- [ ] **Step 1: Write the failing source-inspection test**

Append to the existing `describe('main window behavior', ...)` in `src/main/main-window-behavior.test.ts`:

```ts
  it('creates a resizable window with scaled minimums and persisted bounds', () => {
    const createWindow = extractFunction('createWindow');
    expect(createWindow).toContain('resizable: true');
    expect(createWindow).toContain('maximizable: true');
    expect(createWindow).toContain('fullscreenable: false');
    expect(createWindow).not.toContain('maxWidth');
    expect(createWindow).not.toContain('maxHeight');
    expect(createWindow).toContain('resolveWindowBounds(');
    expect(createWindow).toContain("window.on('resize', scheduleWindowStateSave)");
    expect(createWindow).toContain("window.on('move', scheduleWindowStateSave)");
    expect(createWindow).toContain('persistWindowState()');

    const applyWindowScale = extractFunction('applyWindowScale');
    expect(applyWindowScale).toContain('window.setMinimumSize(minWidth, minHeight)');
    expect(applyWindowScale).toContain('growBoundsToMinimum(');
    expect(applyWindowScale).not.toContain('setMaximumSize');
    expect(applyWindowScale).not.toContain('setResizable(false)');
    expect(applyWindowScale).not.toContain('setMaximizable(false)');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/main-window-behavior.test.ts`
Expected: FAIL on the new `it` block (old block still passes).

- [ ] **Step 3: Modify `main.ts`**

3a. Add the import near the other local imports at the top:

```ts
import { growBoundsToMinimum, loadWindowState, resolveWindowBounds, saveWindowState } from './window-state';
```

3b. Add persistence helpers next to `sendToMainWindow` (module scope):

```ts
let windowStateSaveTimer: NodeJS.Timeout | null = null;

function persistWindowState(): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  const maximized = window.isMaximized();
  const bounds = maximized ? window.getNormalBounds() : window.getBounds();
  saveWindowState(app.getPath('userData'), { ...bounds, maximized });
}

function scheduleWindowStateSave(): void {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
  }
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    persistWindowState();
  }, 500);
}
```

3c. Replace the body of `applyWindowScale` with:

```ts
function applyWindowScale(window: BrowserWindow, uiScalePercent: UiScalePercent, recenter: boolean): void {
  const { width: minWidth, height: minHeight } = scaledWindowSize(uiScalePercent);
  window.webContents.setZoomFactor(uiScalePercent / 100);
  window.setMinimumSize(minWidth, minHeight);

  const currentBounds = window.getBounds();
  const workArea = screen.getDisplayMatching(currentBounds).workArea;
  const grown = growBoundsToMinimum(currentBounds, workArea, minWidth, minHeight);
  const x = recenter
    ? Math.round(Math.max(workArea.x, Math.min(workArea.x + ((workArea.width - grown.width) / 2), workArea.x + workArea.width - grown.width)))
    : grown.x;
  const y = recenter
    ? Math.round(Math.max(workArea.y, Math.min(workArea.y + ((workArea.height - grown.height) / 2), workArea.y + workArea.height - grown.height)))
    : grown.y;
  if (recenter || grown !== currentBounds) {
    window.setBounds({ x, y, width: grown.width, height: grown.height }, false);
  }
}
```

3d. In `createWindow` (~line 390), restore saved bounds and drop the size lock. Replace the size computation and `BrowserWindow` options block:

```ts
function createWindow(uiScalePercent: UiScalePercent): BrowserWindow {
  const { width: minWidth, height: minHeight } = scaledWindowSize(uiScalePercent);
  const savedState = loadWindowState(app.getPath('userData'));
  const workArea = screen.getPrimaryDisplay().workArea;
  const restoredBounds = resolveWindowBounds(savedState, workArea, minWidth, minHeight);
  const rendererIndexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  const window = new BrowserWindow({
    width: restoredBounds?.width ?? minWidth,
    height: restoredBounds?.height ?? minHeight,
    ...(restoredBounds ? { x: restoredBounds.x, y: restoredBounds.y } : {}),
    minWidth,
    minHeight,
    show: false,
    title: 'DS5 Bridge',
    frame: false,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    transparent: false,
    backgroundColor: '#0b1017',
    skipTaskbar: false,
    icon: createRuntimeIcon(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
```

(Everything from `window.webContents.session.setPermissionRequestHandler` on stays as-is, except the additions in 3e.)

3e. Still in `createWindow`, extend the existing handlers: add persistence to the `close` handler and wire resize/move/maximize events next to the existing `will-move`/`move` handlers:

```ts
  window.on('close', (event) => {
    persistWindowState();
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('will-move', () => bridgeService?.pausePollingFor(1200));
  window.on('move', () => bridgeService?.pausePollingFor(700));
  window.on('resize', scheduleWindowStateSave);
  window.on('move', scheduleWindowStateSave);
  window.on('maximize', scheduleWindowStateSave);
  window.on('unmaximize', scheduleWindowStateSave);
```

3f. Restore the maximized flag after load. In `createWindow`, extend the existing `did-finish-load` handler:

```ts
  window.webContents.once('did-finish-load', () => {
    applyWindowScale(window, uiScalePercent, false);
    if (savedState?.maximized) {
      window.maximize();
    }
  });
```

Note: `sendWindowMaximizedState` and the `window:maximizedChanged` IPC already exist — check how it is wired (search `maximize` in `main.ts`); if `maximize`/`unmaximize` listeners already call it, merge the `scheduleWindowStateSave` calls into those listeners instead of registering duplicates.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/main/main-window-behavior.test.ts && npx vitest run src/main/window-state.test.ts && npx tsc --noEmit -p .`
Expected: PASS / no type errors. (If the repo uses a different type-check script, use `npm run` equivalent from `package.json`.)

- [ ] **Step 5: Run the full companion suite**

Run: `npm run test:companion`
Expected: PASS — no regressions (existing scale-restore test in `main-window-behavior.test.ts` must still pass).

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts src/main/main-window-behavior.test.ts
git commit -m "feat: make main window resizable with persisted bounds"
```

---

### Task 3: Top resize edge on the frameless titlebar

**Files:**
- Modify: `src/renderer/styles.css` (`.window-bar` rule ~line 811)
- Test: `src/renderer/styles-layout.test.ts` (source-inspection style, mirror existing assertions)

**Interfaces:** none (CSS only).

- [ ] **Step 1: Write the failing test**

Open `src/renderer/styles-layout.test.ts`, follow its existing pattern (it reads `styles.css` as text), and add:

```ts
  it('leaves a no-drag resize strip above the window bar', () => {
    expect(stylesSource).toContain('.window-resize-edge');
    expect(stylesSource).toMatch(/\.window-resize-edge\s*\{[^}]*-webkit-app-region:\s*no-drag/);
  });
```

(Adjust the source-variable name to whatever that file already uses when reading the CSS.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/styles-layout.test.ts`
Expected: FAIL — `.window-resize-edge` not found.

- [ ] **Step 3: Add the CSS and the element**

In `src/renderer/styles.css`, after the `.window-bar` rule:

```css
.window-resize-edge {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  z-index: 1000;
  -webkit-app-region: no-drag;
}
```

In `src/renderer/App.tsx`, render `<div className="window-resize-edge" />` as the first child of the shell/root element (locate the top-level wrapper that contains the `.window-bar`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/styles-layout.test.ts && npm run test:companion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css src/renderer/App.tsx src/renderer/styles-layout.test.ts
git commit -m "feat: keep top resize edge usable on frameless titlebar"
```

---

### Task 4: Manual verification on hardware (Wayland)

**Files:** none.

- [ ] **Step 1: Build and launch the app** (use the repo's usual dev launch, e.g. `npm run dev` or the packaged build script in `package.json`).
- [ ] **Step 2: Verify:** edge/corner resize works on all edges including the top strip; titlebar drag still works; maximize/unmaximize via titlebar button.
- [ ] **Step 3: Verify scale interaction:** set UI Scale to 125% with a small window → window grows to the new minimum; set a large window then change scale → size preserved.
- [ ] **Step 4: Verify persistence:** resize + move, quit fully (tray → quit), relaunch → size/position restored. Also verify maximized state restores.
- [ ] **Step 5:** Report results; fix anything found using superpowers:systematic-debugging.
