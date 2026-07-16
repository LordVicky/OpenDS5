import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAMING_SHORTCUTS_SETTINGS, type GamingShortcutsSettings } from '../../shared/gaming-shortcuts';
import type { ControllerInputState } from '../../shared/trigger-modifier-eval';
import { ActionExecutor } from './action-executor';
import { GamingShortcutsCoordinator } from './coordinator';

async function flushQueue(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

class FakeInput extends EventEmitter {
  emitInput(buttons: ControllerInputState['buttons'], timestampMs: number): void {
    this.emit('input', { buttons, timestampMs, l2: 0, r2: 0 });
  }
}

describe('GamingShortcutsCoordinator', () => {
  beforeEach(() => vi.useFakeTimers());

  it('resolves a global PS binding and dispatches it asynchronously', async () => {
    const input = new FakeInput();
    const settings: GamingShortcutsSettings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, singlePress: { type: 'open-opends5' } };
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
    const settings = { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS, enabled: true, singlePress: { type: 'open-opends5' } as const };
    const coordinator = new GamingShortcutsCoordinator({ input, settingsStore: { get: () => ({ gamingShortcuts: settings }) }, executor: { execute } as unknown as ActionExecutor }); coordinator.start();
    input.emitInput(new Set(['ps']), 0); input.emitInput(new Set(), 1); vi.advanceTimersByTime(300); await Promise.resolve();
    input.emitInput(new Set(['ps']), 1000); input.emitInput(new Set(), 1001); vi.advanceTimersByTime(300); await flushQueue();
    expect(execute).toHaveBeenCalledTimes(1); release(); await flushQueue(); expect(execute).toHaveBeenCalledTimes(2);
    coordinator.stop();
  });
});
