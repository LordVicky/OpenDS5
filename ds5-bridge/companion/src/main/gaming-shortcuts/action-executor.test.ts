import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ActionExecutor } from './action-executor';
import { LinuxActionProvider } from './providers/linux-actions';
import { ScreenshotProvider } from './providers/screenshot';
import { GpuScreenRecorderProvider } from './providers/recording';

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

  it('toggles MangoHud by sending F12 to the focused game', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, signal: null, timedOut: false });
    const executor = new ActionExecutor({ runner: { run }, linuxProvider: new LinuxActionProvider({ hasExecutable: (name) => name === 'wtype' }) });
    await expect(executor.execute({ type: 'performance-hud-toggle', provider: 'mangohud' })).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith('wtype', ['-k', 'F12']);
  });

  it('executes screenshots through the selected provider', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, signal: null, timedOut: false });
    const executor = new ActionExecutor({
      runner: { run },
      screenshotProvider: new ScreenshotProvider({
        env: { HOME: '/home/test', XDG_PICTURES_DIR: '/tmp' },
        now: () => new Date('2026-07-16T12:34:56.789Z'),
        hasExecutable: (name) => name === 'grim'
      })
    });
    await expect(executor.execute({ type: 'screenshot', provider: 'grim' })).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith('grim', ['/tmp/OpenDS5-2026-07-16T12-34-56-789Z.png']);
  });

  it('executes an explicit hyprshot screenshot provider', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, signal: null, timedOut: false });
    const executor = new ActionExecutor({
      runner: { run },
      screenshotProvider: new ScreenshotProvider({
        env: { HOME: '/home/test', XDG_PICTURES_DIR: '/tmp' },
        now: () => new Date('2026-07-16T12:34:56.789Z'),
        hasExecutable: (name) => name === 'hyprshot'
      })
    });
    await expect(executor.execute({ type: 'screenshot', provider: 'hyprshot' })).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith('hyprshot', ['-m', 'window', '-m', 'active', '-o', '/tmp', '-f', 'OpenDS5-2026-07-16T12-34-56-789Z.png']);
  });

  it('accepts a screenshot when the image was saved despite a non-zero exit code', async () => {
    const outputPath = '/tmp/OpenDS5-2026-07-16T12-34-56-789Z.png';
    const run = vi.fn().mockImplementation(async () => {
      fs.writeFileSync(outputPath, 'screenshot');
      return { code: 1, signal: null, timedOut: false };
    });
    try {
      const executor = new ActionExecutor({
        runner: { run },
        screenshotProvider: new ScreenshotProvider({
          env: { HOME: '/home/test', XDG_PICTURES_DIR: '/tmp' },
          now: () => new Date('2026-07-16T12:34:56.789Z'),
          hasExecutable: (name) => name === 'grim'
        })
      });
      await expect(executor.execute({ type: 'screenshot', provider: 'grim' })).resolves.toEqual({ ok: true });
    } finally {
      fs.rmSync(outputPath, { force: true });
    }
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

  it('starts and stops only its owned GPU Screen Recorder process', async () => {
    const kill = vi.fn();
    const child = { kill, once: vi.fn((event: string, listener: () => void) => { if (event === 'exit') void listener; return child; }) } as never;
    const spawn = vi.fn(() => child);
    const recordingProvider = new GpuScreenRecorderProvider({
      env: { HOME: '/tmp/opends5-gaming-shortcuts-test' },
      now: () => new Date('2026-07-16T12:34:56.789Z'),
      hasExecutable: (name) => name === 'gpu-screen-recorder',
      spawn
    });
    const executor = new ActionExecutor({ recordingProvider });
    await expect(executor.execute({ type: 'recording-toggle', provider: 'auto' })).resolves.toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledWith('gpu-screen-recorder', ['-w', 'portal', '-f', '60', '-o', '/tmp/opends5-gaming-shortcuts-test/Videos/OpenDS5-2026-07-16T12-34-56-789Z.mp4']);
    await expect(executor.execute({ type: 'recording-toggle', provider: 'gpu-screen-recorder' })).resolves.toEqual({ ok: true });
    expect(kill).toHaveBeenCalledWith('SIGINT');
  });
});
