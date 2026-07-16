import { describe, expect, it, vi } from 'vitest';
import { ActionExecutor } from './action-executor';
import { LinuxActionProvider } from './providers/linux-actions';

describe('ActionExecutor', () => {
  it('runs explicit executable arguments', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, signal: null });
    const executor = new ActionExecutor({ runner: { run } });
    await expect(executor.execute({ type: 'custom-executable', executable: 'notify-send', args: ['hello world'] })).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith('notify-send', ['hello world']);
  });

  it('reports process failures without throwing', async () => {
    const executor = new ActionExecutor({ runner: { run: vi.fn().mockResolvedValue({ code: 1, signal: null }) } });
    await expect(executor.execute({ type: 'launch-app', executable: 'game', args: [] })).resolves.toMatchObject({ ok: false, reason: 'failed' });
  });

  it('reports process timeouts distinctly', async () => {
    const executor = new ActionExecutor({ runner: { run: vi.fn().mockResolvedValue({ code: null, signal: 'SIGKILL', timedOut: true }) } });
    await expect(executor.execute({ type: 'launch-app', executable: 'game', args: [] })).resolves.toEqual({ ok: false, reason: 'failed', error: 'Process timed out' });
  });

  it('converts runner errors into structured failures', async () => {
    const executor = new ActionExecutor({ runner: { run: vi.fn().mockRejectedValue(new Error('not found')) } });
    await expect(executor.execute({ type: 'custom-executable', executable: 'missing', args: [] })).resolves.toEqual({ ok: false, reason: 'failed', error: 'not found' });
  });

  it('repairs malformed runtime input before execution', async () => {
    const run = vi.fn();
    const executor = new ActionExecutor({ runner: { run } });
    await expect(executor.execute({ type: 'custom-executable', executable: 'bad\0name', args: [] })).resolves.toEqual({ ok: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('executes volume actions through the fixed Linux provider command', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, signal: null, timedOut: false });
    const executor = new ActionExecutor({ runner: { run }, linuxProvider: new LinuxActionProvider({ hasExecutable: () => true }) });
    await expect(executor.execute({ type: 'volume', direction: 'up' })).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith('wpctl', ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', '5%+']);
  });

  it('does not invoke a runner for unavailable provider actions', async () => {
    const run = vi.fn();
    const executor = new ActionExecutor({ runner: { run }, linuxProvider: new LinuxActionProvider({ hasExecutable: () => false }) });
    await expect(executor.execute({ type: 'volume', direction: 'up' })).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(run).not.toHaveBeenCalled();
  });

  it('opens OpenDS5 through its injected callback', async () => {
    const openOpenDS5 = vi.fn();
    await expect(new ActionExecutor({ openOpenDS5 }).execute({ type: 'open-opends5' })).resolves.toEqual({ ok: true });
    expect(openOpenDS5).toHaveBeenCalledOnce();
  });

  it('reports OpenDS5 unavailable when no callback is configured', async () => {
    await expect(new ActionExecutor().execute({ type: 'open-opends5' })).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});
