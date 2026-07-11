import { describe, expect, it } from 'vitest';
import { SETUP_CHANNELS } from './setup-ipc';

describe('setup IPC contract', () => {
  it('defines all channels with the setup: prefix', () => {
    const values = Object.values(SETUP_CHANNELS);
    expect(values).toHaveLength(8);
    for (const v of values) expect(v).toMatch(/^setup:/);
    expect(new Set(values).size).toBe(8);
  });
});
