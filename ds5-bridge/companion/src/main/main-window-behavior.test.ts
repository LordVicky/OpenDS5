import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

function extractFunction(name: string): string {
  const start = mainSource.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = mainSource.indexOf('\nfunction ', start + 1);
  return mainSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe('main window behavior', () => {
  it('reapplies the saved UI scale when Windows restores a compacted window', () => {
    const showMainWindow = extractFunction('showMainWindow');
    const restoreMainWindowScale = extractFunction('restoreMainWindowScale');
    const currentUiScalePercent = extractFunction('currentUiScalePercent');

    expect(currentUiScalePercent).toContain('bridgeService?.getSnapshot().settings.uiScalePercent');
    expect(restoreMainWindowScale).toContain('applyWindowScale(window, currentUiScalePercent(), recenter);');
    expect(showMainWindow.indexOf('restoreMainWindowScale(false);')).toBeGreaterThanOrEqual(0);
    expect(showMainWindow.indexOf('restoreMainWindowScale(false);')).toBeLessThan(
      showMainWindow.indexOf('mainWindow.show();')
    );

    expect(mainSource).toContain("mainWindow.on('show', () => scheduleMainWindowScaleRestore(false));");
    expect(mainSource).toContain("mainWindow.on('restore', () => scheduleMainWindowScaleRestore(false));");
    expect(mainSource).toContain("mainWindow.on('focus', () => scheduleMainWindowScaleRestore(false));");
    expect(mainSource).toContain("powerMonitor.on('resume', () => scheduleMainWindowScaleRestore(true));");
    expect(mainSource).toContain("powerMonitor.on('unlock-screen', () => scheduleMainWindowScaleRestore(true));");
    expect(mainSource).toContain("screen.on('display-metrics-changed', () => scheduleMainWindowScaleRestore(true));");
  });

  it('creates a resizable window with scaled minimums and persisted bounds', () => {
    const createWindow = extractFunction('createWindow');
    expect(createWindow).toContain('resizable: true');
    expect(createWindow).toContain('maximizable: true');
    expect(createWindow).toContain('fullscreenable: false');
    expect(createWindow).not.toContain('maxWidth');
    expect(createWindow).not.toContain('maxHeight');
    expect(createWindow).toContain('resolveWindowBounds(');
    expect(createWindow).toContain("window.on('resize', () => {");
    expect(createWindow).toContain('repaintWindowAfterResize(window);');
    expect(createWindow).toContain("window.on('move', scheduleWindowStateSave)");
    expect(createWindow).toContain('persistWindowState()');

    const applyWindowScale = extractFunction('applyWindowScale');
    expect(applyWindowScale).toContain('window.setMinimumSize(minWidth, minHeight)');
    expect(applyWindowScale).toContain('growBoundsToMinimum(');
    expect(applyWindowScale).not.toContain('setMaximumSize');
    expect(applyWindowScale).not.toContain('setResizable(false)');
    expect(applyWindowScale).not.toContain('setMaximizable(false)');
  });

  it('only recenters the window when it is not visible on any display', () => {
    const showMainWindow = extractFunction('showMainWindow');
    expect(showMainWindow).toContain('screen.getAllDisplays()');
    expect(showMainWindow).toContain('if (!visibleOnAnyDisplay)');
  });
});
