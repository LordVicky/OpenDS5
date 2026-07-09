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
