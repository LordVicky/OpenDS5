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

// What a first launch opens at, before any bounds have been saved. The window used to open at
// its own minimum size, so it always started as small as it was allowed to be.
export const DEFAULT_WINDOW_WIDTH = 1360;
export const DEFAULT_WINDOW_HEIGHT = 860;

/**
 * The size a first launch opens at: the default scaled by the UI scale, never smaller than the
 * resize floor and never larger than the display it lands on.
 */
export function defaultWindowSize(
  uiScalePercent: number,
  workArea: { width: number; height: number },
  minWidth: number,
  minHeight: number
): { width: number; height: number } {
  const scale = uiScalePercent / 100;
  return {
    width: Math.max(minWidth, Math.min(Math.round(DEFAULT_WINDOW_WIDTH * scale), workArea.width)),
    height: Math.max(minHeight, Math.min(Math.round(DEFAULT_WINDOW_HEIGHT * scale), workArea.height))
  };
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
