import { describe, expect, it } from 'vitest';

import { parseControllerFirmwareReport } from './controller-firmware';

/**
 * Feature report 0x20 captured from a physical DualSense (054C:0CE6, sw_series
 * 0x0004) over USB. Offsets follow the kernel's dualsense_get_firmware_info():
 * hardware_version at 24, firmware_version at 28, update version at 44.
 */
const REAL_FIRMWARE_REPORT = hexToBytes(
  '20 4a 75 6c 20 20 34 20 32 30 32 35 31 30 3a 31 ' +
  '30 3a 33 32 02 00 04 00 13 03 00 00 2a 00 10 01 ' +
  '41 0a 00 00 00 00 00 00 00 00 00 00 30 06 00 00 ' +
  '2a 00 01 00 0a 00 02 00 06 00 00 00 8e e6 45 91'
);

function hexToBytes(hex: string): number[] {
  return hex.trim().split(/\s+/).map((byte) => parseInt(byte, 16));
}

describe('parseControllerFirmwareReport', () => {
  it('reports the version Sony publishes for this controller', () => {
    const info = parseControllerFirmwareReport(REAL_FIRMWARE_REPORT);

    expect(info?.firmwareVersion).toBe('0x0630');
  });

  it('reports the hardware version the kernel exposes via sysfs', () => {
    const info = parseControllerFirmwareReport(REAL_FIRMWARE_REPORT);

    expect(info?.hardwareVersion).toBe('0x00000313');
  });

  it('reports the internal firmware version that Linux tools print', () => {
    const info = parseControllerFirmwareReport(REAL_FIRMWARE_REPORT);

    expect(info?.internalFirmwareVersion).toBe('0x0110002a');
  });

  it('reports the firmware build stamp', () => {
    const info = parseControllerFirmwareReport(REAL_FIRMWARE_REPORT);

    expect(info?.buildDate).toBe('Jul  4 2025');
    expect(info?.buildTime).toBe('10:10:32');
  });

  it('rejects a report that is not the firmware info report', () => {
    const wrongReport = [...REAL_FIRMWARE_REPORT];
    wrongReport[0] = 0x05;

    expect(parseControllerFirmwareReport(wrongReport)).toBeNull();
  });

  it('rejects a truncated report rather than reading past the end', () => {
    expect(parseControllerFirmwareReport(REAL_FIRMWARE_REPORT.slice(0, 40))).toBeNull();
  });
});
