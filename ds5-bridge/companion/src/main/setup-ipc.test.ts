import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETUP_CHANNELS } from './setup-ipc';

describe('setup IPC contract', () => {
  it('defines all channels with the setup: prefix', () => {
    const values = Object.values(SETUP_CHANNELS);
    expect(values).toHaveLength(8);
    for (const v of values) expect(v).toMatch(/^setup:/);
    expect(new Set(values).size).toBe(8);
  });

  // The preload is sandboxed and cannot require() this module, so it inlines
  // the channel names. Pin the two copies together.
  it('preload inlines exactly these channel names', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.ts'), 'utf8');
    for (const [key, channel] of Object.entries(SETUP_CHANNELS)) {
      expect(preload).toContain(`${key}: '${channel}'`);
    }
    // and no runtime import of the main-process module (would throw when sandboxed)
    expect(preload).not.toMatch(/^import \{[^}]*SETUP_CHANNELS/m);
  });
});
