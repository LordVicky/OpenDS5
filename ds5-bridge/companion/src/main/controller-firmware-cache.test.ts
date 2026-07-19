import { describe, expect, it } from 'vitest';

import { ControllerFirmwareCache, type HidDeviceIdentity } from './controller-firmware';
import type { ControllerFirmwareInfo } from '../shared/types';

const INFO: ControllerFirmwareInfo = {
  firmwareVersion: '0x0630',
  internalFirmwareVersion: '0x0110002a',
  hardwareVersion: '0x00000313',
  buildDate: 'Jul  4 2025',
  buildTime: '10:10:32'
};

const DEVICES: HidDeviceIdentity[] = [
  { vendorId: 0x054c, productId: 0x0ce6, path: '/dev/hidraw13' }
];

describe('ControllerFirmwareCache', () => {
  it('reads the controller once and serves the cached value afterwards', () => {
    let reads = 0;
    const cache = new ControllerFirmwareCache(() => {
      reads += 1;
      return INFO;
    });

    expect(cache.get(true, DEVICES)).toEqual(INFO);
    expect(cache.get(true, DEVICES)).toEqual(INFO);
    expect(cache.get(true, DEVICES)).toEqual(INFO);
    expect(reads).toBe(1);
  });

  it('forwards the enumerated devices to the reader', () => {
    let seen: readonly HidDeviceIdentity[] | null = null;
    const cache = new ControllerFirmwareCache((devices) => {
      seen = devices;
      return INFO;
    });

    cache.get(true, DEVICES);

    expect(seen).toEqual(DEVICES);
  });

  it('does not touch the controller while disconnected', () => {
    let reads = 0;
    const cache = new ControllerFirmwareCache(() => {
      reads += 1;
      return INFO;
    });

    expect(cache.get(false, DEVICES)).toBeNull();
    expect(reads).toBe(0);
  });

  it('re-reads after a reconnect so a swapped controller is picked up', () => {
    let reads = 0;
    const cache = new ControllerFirmwareCache(() => {
      reads += 1;
      return INFO;
    });

    cache.get(true, DEVICES);
    cache.reset();
    cache.get(true, DEVICES);

    expect(reads).toBe(2);
  });

  it('does not retry a failed read on every poll', () => {
    let reads = 0;
    const cache = new ControllerFirmwareCache(() => {
      reads += 1;
      return null;
    });

    expect(cache.get(true, DEVICES)).toBeNull();
    expect(cache.get(true, DEVICES)).toBeNull();
    expect(reads).toBe(1);
  });
});
