import { describe, expect, it } from 'vitest';
import { ScreenshotProvider } from './screenshot';

describe('ScreenshotProvider', () => {
  const now = () => new Date('2026-07-16T12:34:56.789Z');

  it('prefers grim automatically on Wayland', () => {
    const provider = new ScreenshotProvider({
      env: { HOME: '/home/test', WAYLAND_DISPLAY: 'wayland-1' }, now,
      hasExecutable: (name) => name === 'grim'
    });
    expect(provider.resolve('auto')).toEqual({
      executable: 'grim',
      args: ['/home/test/Pictures/OpenDS5-2026-07-16T12-34-56-789Z.png'],
      outputPath: '/home/test/Pictures/OpenDS5-2026-07-16T12-34-56-789Z.png'
    });
  });

  it('prefers active-window hyprshot capture on Hyprland', () => {
    const provider = new ScreenshotProvider({
      env: { HOME: '/home/test', HYPRLAND_INSTANCE_SIGNATURE: '1', WAYLAND_DISPLAY: 'wayland-1' }, now,
      hasExecutable: (name) => name === 'hyprshot'
    });
    expect(provider.resolve('auto')).toEqual({
      executable: 'hyprshot',
      args: ['-m', 'window', '-m', 'active', '-o', '/home/test/Pictures', '-f', 'OpenDS5-2026-07-16T12-34-56-789Z.png'],
      outputPath: '/home/test/Pictures/OpenDS5-2026-07-16T12-34-56-789Z.png'
    });
  });

  it('uses the explicit desktop provider and XDG pictures directory', () => {
    const provider = new ScreenshotProvider({
      env: { HOME: '/home/test', XDG_PICTURES_DIR: '/mnt/captures' }, now,
      hasExecutable: (name) => name === 'spectacle'
    });
    expect(provider.resolve('spectacle')).toEqual({
      executable: 'spectacle',
      args: ['-b', '-n', '-o', '/mnt/captures/OpenDS5-2026-07-16T12-34-56-789Z.png'],
      outputPath: '/mnt/captures/OpenDS5-2026-07-16T12-34-56-789Z.png'
    });
  });

  it('returns unavailable when auto detection finds no tool', () => {
    expect(new ScreenshotProvider({ env: { HOME: '/home/test' }, now, hasExecutable: () => false }).resolve('auto')).toBeNull();
  });
});
