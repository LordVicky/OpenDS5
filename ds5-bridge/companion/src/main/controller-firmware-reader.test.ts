import { describe, expect, it } from 'vitest';

import { readControllerFirmware, type HidDeviceLike, type HidOpener } from './controller-firmware';

const REAL_FIRMWARE_REPORT = hexToBytes(
  '20 4a 75 6c 20 20 34 20 32 30 32 35 31 30 3a 31 ' +
  '30 3a 33 32 02 00 04 00 13 03 00 00 2a 00 10 01 ' +
  '41 0a 00 00 00 00 00 00 00 00 00 00 30 06 00 00 ' +
  '2a 00 01 00 0a 00 02 00 06 00 00 00 8e e6 45 91'
);

function hexToBytes(hex: string): number[] {
  return hex.trim().split(/\s+/).map((byte) => parseInt(byte, 16));
}

const DUALSENSE = { vendorId: 0x054c, productId: 0x0ce6, path: '/dev/hidraw13' };
const DUALSENSE_EDGE = { vendorId: 0x054c, productId: 0x0df2, path: '/dev/hidraw9' };
const LOGITECH_RECEIVER = { vendorId: 0x046d, productId: 0xc52b, path: '/dev/hidraw4' };

function openerReturning(report: number[]): HidOpener {
  return { open: () => ({ getFeatureReport: () => report, close: () => undefined }) };
}

describe('readControllerFirmware', () => {
  it('reads firmware info from a connected DualSense', () => {
    const info = readControllerFirmware(openerReturning(REAL_FIRMWARE_REPORT), [DUALSENSE]);

    expect(info?.firmwareVersion).toBe('0x0630');
  });

  it('reads firmware info from a connected DualSense Edge', () => {
    const info = readControllerFirmware(openerReturning(REAL_FIRMWARE_REPORT), [DUALSENSE_EDGE]);

    expect(info?.firmwareVersion).toBe('0x0630');
  });

  it('picks the DualSense out of a list of unrelated HID devices', () => {
    let openedPath: string | null = null;
    const opener: HidOpener = {
      open: (path) => {
        openedPath = path;
        return { getFeatureReport: () => REAL_FIRMWARE_REPORT, close: () => undefined };
      }
    };

    readControllerFirmware(opener, [LOGITECH_RECEIVER, DUALSENSE]);

    expect(openedPath).toBe('/dev/hidraw13');
  });

  it('returns null when no DualSense is connected', () => {
    expect(readControllerFirmware(openerReturning(REAL_FIRMWARE_REPORT), [LOGITECH_RECEIVER])).toBeNull();
  });

  it('returns null when the device list is empty', () => {
    expect(readControllerFirmware(openerReturning(REAL_FIRMWARE_REPORT), [])).toBeNull();
  });

  it('returns null instead of throwing when the device cannot be opened', () => {
    const opener: HidOpener = {
      open: () => {
        throw new Error('EACCES: permission denied');
      }
    };

    expect(readControllerFirmware(opener, [DUALSENSE])).toBeNull();
  });

  it('closes the device even when the feature read fails', () => {
    let closed = 0;
    const opener: HidOpener = {
      open: (): HidDeviceLike => ({
        getFeatureReport: () => {
          throw new Error('read failed');
        },
        close: () => {
          closed += 1;
        }
      })
    };

    expect(readControllerFirmware(opener, [DUALSENSE])).toBeNull();
    expect(closed).toBe(1);
  });

  it('closes the device after a successful read', () => {
    let closed = 0;
    const opener: HidOpener = {
      open: (): HidDeviceLike => ({
        getFeatureReport: () => REAL_FIRMWARE_REPORT,
        close: () => {
          closed += 1;
        }
      })
    };

    readControllerFirmware(opener, [DUALSENSE]);

    expect(closed).toBe(1);
  });
});
