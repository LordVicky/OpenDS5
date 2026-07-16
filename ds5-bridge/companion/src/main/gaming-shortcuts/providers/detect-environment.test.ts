import { describe, expect, it } from 'vitest';
import { detectDesktopEnvironment, detectProviderCapabilities } from './detect-environment';

describe('detectDesktopEnvironment', () => {
  it('prioritizes explicit compositor signals', () => {
    expect(detectDesktopEnvironment({ env: { XDG_CURRENT_DESKTOP: 'KDE', HYPRLAND_INSTANCE_SIGNATURE: '1', WAYLAND_DISPLAY: 'wayland-1' } })).toBe('hyprland');
    expect(detectDesktopEnvironment({ env: { SWAYSOCK: '/run/sway.sock', DISPLAY: ':0' } })).toBe('sway');
    expect(detectDesktopEnvironment({ env: { GAMESCOPE_WAYLAND_DISPLAY: 'gamescope-0' } })).toBe('gamescope');
  });

  it('recognizes desktop names and generic sessions', () => {
    expect(detectDesktopEnvironment({ env: { XDG_CURRENT_DESKTOP: 'KDE', WAYLAND_DISPLAY: 'wayland-0' } })).toBe('kde');
    expect(detectDesktopEnvironment({ env: { XDG_SESSION_DESKTOP: 'gnome', WAYLAND_DISPLAY: 'wayland-0' } })).toBe('gnome');
    expect(detectDesktopEnvironment({ env: { WAYLAND_DISPLAY: 'wayland-0' } })).toBe('wayland');
    expect(detectDesktopEnvironment({ env: { DISPLAY: ':0' } })).toBe('x11');
  });
});

describe('detectProviderCapabilities', () => {
  it('reports only commands available through the injected probe', () => {
    const available = new Set(['grim', 'gpu-screen-recorder', 'mangohud']);
    expect(detectProviderCapabilities({
      env: { HYPRLAND_INSTANCE_SIGNATURE: '1', WAYLAND_DISPLAY: 'wayland-0' },
      hasExecutable: (name) => available.has(name)
    })).toEqual({
      environment: 'hyprland',
      screenshot: ['grim'],
      recording: ['gpu-screen-recorder'],
      hud: ['mangohud'],
      keyboard: []
    });
  });
});
