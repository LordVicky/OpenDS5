import { describe, expect, it } from 'vitest';
import { LinuxActionProvider } from './linux-actions';

describe('LinuxActionProvider', () => {
  const provider = new LinuxActionProvider({ hasExecutable: (name) => name === 'wpctl' });

  it('resolves volume changes to fixed wpctl arguments', () => {
    expect(provider.resolve({ type: 'volume', direction: 'up' })).toEqual({
      executable: 'wpctl',
      args: ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', '5%+']
    });
    expect(provider.resolve({ type: 'volume', direction: 'down' })).toEqual({
      executable: 'wpctl',
      args: ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', '5%-']
    });
    expect(provider.resolve({ type: 'volume', direction: 'mute' })).toEqual({
      executable: 'wpctl',
      args: ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle']
    });
  });

  it('resolves the default microphone toggle', () => {
    expect(provider.resolve({ type: 'microphone-mute-toggle' })).toEqual({
      executable: 'wpctl',
      args: ['set-mute', '@DEFAULT_AUDIO_SOURCE@', 'toggle']
    });
  });

  it('reports unavailable when wpctl is missing', () => {
    expect(new LinuxActionProvider({ hasExecutable: () => false }).resolve({ type: 'volume', direction: 'up' })).toBeNull();
  });
});
