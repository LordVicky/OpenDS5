import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAMING_SHORTCUTS_SETTINGS, type GamingShortcutsSettings } from '../../shared/gaming-shortcuts';
import type { ControllerInputState } from '../../shared/trigger-modifier-eval';
import { ActionExecutor } from './action-executor';
import { GamingShortcutsCoordinator } from './coordinator';

async function flushQueue(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

class FakeInput extends EventEmitter {
  emitInput(buttons: ControllerInputState['buttons'], timestampMs: number, sourceId: string | null = null): void {
    this.emit('input', { buttons, timestampMs, sourceId, l2: 0, r2: 0 });
  }
}

describe('GamingShortcutsCoordinator', () => {
  beforeEach(() => vi.useFakeTimers());

  it('resolves a global PS binding and dispatches it asynchronously', async () => {
    const input = new FakeInput();
    const settings: GamingShortcutsSettings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, psPressAction: 'open-opends5' };
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const coordinator = new GamingShortcutsCoordinator({
      input,
      settingsStore: { get: () => ({ gamingShortcuts: settings }) },
      executor: { execute } as unknown as ActionExecutor
    });
    const result = vi.fn(); coordinator.on('result', result); coordinator.start();
    input.emitInput(new Set(['ps']), 0); input.emitInput(new Set(), 1);
    vi.advanceTimersByTime(300);
    await flushQueue();
    expect(execute).toHaveBeenCalledWith({ type: 'open-opends5' });
    expect(result).toHaveBeenCalledOnce();
    coordinator.stop();
  });

  it('dispatches a configured single-press action', async () => {
    const input = new FakeInput();
    const action = { type: 'screenshot' as const, provider: 'auto' as const };
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const settings: GamingShortcutsSettings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, singlePress: action };
    const coordinator = new GamingShortcutsCoordinator({ input, settingsStore: { get: () => ({ gamingShortcuts: settings }) }, executor: { execute } as unknown as ActionExecutor });
    coordinator.start();
    input.emitInput(new Set(['ps']), 0); input.emitInput(new Set(), 1);
    vi.advanceTimersByTime(300);
    await flushQueue();
    expect(execute).toHaveBeenCalledWith(action);
    coordinator.stop();
  });

  it('does not dispatch while disabled and removes its listener on stop', () => {
    const input = new FakeInput();
    const execute = vi.fn();
    const coordinator = new GamingShortcutsCoordinator({ input, settingsStore: { get: () => ({ gamingShortcuts: DEFAULT_GAMING_SHORTCUTS_SETTINGS }) }, executor: { execute } as unknown as ActionExecutor });
    coordinator.start(); input.emitInput(new Set(['ps']), 0); input.emitInput(new Set(), 1); vi.advanceTimersByTime(300); coordinator.stop();
    expect(execute).not.toHaveBeenCalled();
  });

  it('serializes actions so a second gesture waits for the first', async () => {
    const input = new FakeInput(); let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn().mockReturnValueOnce(first.then(() => ({ ok: true }))).mockResolvedValueOnce({ ok: true });
    const settings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, chords: [{ button: 'create' as const, action: { type: 'screenshot', provider: 'auto' as const } }] };
    const coordinator = new GamingShortcutsCoordinator({ input, settingsStore: { get: () => ({ gamingShortcuts: settings }) }, executor: { execute } as unknown as ActionExecutor }); coordinator.start();
    input.emitInput(new Set(['ps']), 0); input.emitInput(new Set(['ps', 'create']), 1); input.emitInput(new Set(['ps']), 2); input.emitInput(new Set(), 3); await Promise.resolve();
    input.emitInput(new Set(['ps']), 1000); input.emitInput(new Set(['ps', 'create']), 1001); input.emitInput(new Set(['ps']), 1002); input.emitInput(new Set(), 1003); await flushQueue();
    expect(execute).toHaveBeenCalledTimes(1); release(); await flushQueue(); expect(execute).toHaveBeenCalledTimes(2);
    coordinator.stop();
  });

  it('enters shortcut mode, ignores the activation press, and executes the next mapped button once', async () => {
    const input = new FakeInput();
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const notifications = {
      showShortcutMode: vi.fn().mockResolvedValue(undefined),
      showShortcutReference: vi.fn().mockResolvedValue(undefined),
      showActionResult: vi.fn().mockResolvedValue(undefined),
      showActionError: vi.fn().mockResolvedValue(undefined),
      dismissShortcutNotification: vi.fn().mockResolvedValue(undefined)
    };
    const settings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, chords: [{ button: 'create' as const, action: { type: 'screenshot', provider: 'auto' as const } }] };
    const coordinator = new GamingShortcutsCoordinator({ input, settingsStore: { get: () => ({ gamingShortcuts: settings }) }, executor: { execute } as unknown as ActionExecutor, notifications });
    coordinator.start();
    input.emitInput(new Set(['ps']), 0); input.emitInput(new Set(), 1);
    vi.advanceTimersByTime(300);
    expect(coordinator.getMode().state).toBe('awaiting-selection');
    expect(notifications.showShortcutMode).toHaveBeenCalledOnce();
    input.emitInput(new Set(['create']), 400); input.emitInput(new Set(), 401);
    await flushQueue();
    expect(execute).toHaveBeenCalledWith({ type: 'screenshot', provider: 'auto' });
    expect(coordinator.getMode().state).toBe('inactive');
    coordinator.stop();
  });

  it('does not accept shortcut selections from another physical source', async () => {
    const input = new FakeInput();
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const settings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, chords: [{ button: 'create' as const, action: { type: 'screenshot', provider: 'auto' as const } }] };
    const coordinator = new GamingShortcutsCoordinator({
      input, settingsStore: { get: () => ({ gamingShortcuts: settings }) }, executor: { execute } as unknown as ActionExecutor,
      controllerIdForSource: (sourceId) => sourceId
    });
    coordinator.start();
    input.emitInput(new Set(['ps']), 0, 'source-A'); input.emitInput(new Set(), 1, 'source-A');
    vi.advanceTimersByTime(300);
    expect(coordinator.getMode().state).toBe('awaiting-selection');
    input.emitInput(new Set(['create']), 400, 'source-B'); input.emitInput(new Set(), 401, 'source-B');
    await flushQueue();
    expect(execute).not.toHaveBeenCalled();
    expect(coordinator.getMode().state).toBe('awaiting-selection');
    coordinator.stop();
  });

  it('does not emit a result when the source disconnects during deferred execution', async () => {
    const input = new FakeInput();
    let resolveExecution!: (value: { ok: true }) => void;
    const execute = vi.fn().mockReturnValue(new Promise<{ ok: true }>((resolve) => { resolveExecution = resolve; }));
    const settings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, psPressAction: 'open-opends5' as const };
    const coordinator = new GamingShortcutsCoordinator({ input, settingsStore: { get: () => ({ gamingShortcuts: settings }) }, executor: { execute } as unknown as ActionExecutor, controllerIdForSource: (sourceId) => sourceId });
    const result = vi.fn(); coordinator.on('result', result); coordinator.start();
    input.emitInput(new Set(['ps']), 0, 'source-A'); input.emitInput(new Set(), 1, 'source-A'); vi.advanceTimersByTime(300); await flushQueue();
    input.emit('disconnect', 'source-A'); resolveExecution({ ok: true }); await flushQueue();
    expect(result).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it('cancels shortcut mode on Circle and on timeout', () => {
    const input = new FakeInput();
    const notifications = { showShortcutMode: vi.fn(), showShortcutReference: vi.fn(), showActionResult: vi.fn(), showActionError: vi.fn(), dismissShortcutNotification: vi.fn() };
    const coordinator = new GamingShortcutsCoordinator({ input, settingsStore: { get: () => ({ gamingShortcuts: { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true } }) }, executor: { execute: vi.fn() } as unknown as ActionExecutor, notifications });
    coordinator.start(); input.emitInput(new Set(['ps']), 0); input.emitInput(new Set(), 1); vi.advanceTimersByTime(300);
    input.emitInput(new Set(['circle']), 400); input.emitInput(new Set(), 401);
    expect(coordinator.getMode().state).toBe('inactive');
    input.emitInput(new Set(['ps']), 1000); input.emitInput(new Set(), 1001); vi.advanceTimersByTime(300);
    expect(coordinator.getMode().state).toBe('awaiting-selection');
    vi.advanceTimersByTime(3000);
    expect(coordinator.getMode().state).toBe('inactive');
    coordinator.stop();
  });
});
