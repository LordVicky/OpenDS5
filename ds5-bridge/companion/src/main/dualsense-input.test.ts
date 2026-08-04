import { describe, expect, it } from 'vitest';
import { decodeDualSenseInputReport } from './dualsense-input';

function report(id: number, size: number): number[] {
  const value = new Array<number>(size).fill(0);
  value[0] = id;
  const base = id === 0x01 ? 1 : 3;
  value[base] = 128; value[base + 1] = 128; value[base + 2] = 128; value[base + 3] = 128;
  value[base + 7] = 8; // neutral hat-switch value
  value[base + 32] = 0x80; value[base + 36] = 0x80;
  return value;
}

function crc32(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}

function bluetoothReport(): number[] {
  const value = report(0x31, 78);
  value[10] = 0x0f; // No d-pad direction in buttons[0] (base 3 + 7)
  value[12] = 0x10 | 0x40; // Edge LFN + LB in buttons[2] (base 3 + 9)
  const crc = crc32([0xa1, ...value.slice(0, -4)]);
  value.splice(-4, 4, crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff);
  return value;
}

describe('decodeDualSenseInputReport', () => {
  it('decodes a neutral USB report and diagonal d-pad', () => {
    const value = report(0x01, 64);
    value[8] = 1 | 0x20;
    value[9] = 0x20;
    value[10] = 0x01 | 0x10 | 0x40;
    const decoded = decodeDualSenseInputReport(value);
    expect(decoded).toMatchObject({ lx: 128, ly: 128, l2: 0, r2: 0 });
    expect(decoded?.buttons).toEqual(new Set(['dpad-up', 'dpad-right', 'cross', 'options', 'ps', 'lfn', 'lb']));
  });

  it('decodes Bluetooth full reports with an A1 transport prefix', () => {
    const value = bluetoothReport();
    const decoded = decodeDualSenseInputReport([0xa1, ...value]);
    expect(decoded?.buttons).toEqual(new Set(['lfn', 'lb']));
  });

  it('rejects truncation, unsupported ids, and bad Bluetooth CRC', () => {
    expect(decodeDualSenseInputReport(report(0x01, 63))).toBeNull();
    expect(decodeDualSenseInputReport([0x02, ...new Array(63).fill(0)])).toBeNull();
    const invalid = bluetoothReport(); invalid[20] ^= 1;
    expect(decodeDualSenseInputReport(invalid)).toBeNull();
  });

  it('does not expose Edge-only buttons for a standard model', () => {
    const value = report(0x01, 64); value[8] = 0x0f; value[10] = 0x10 | 0x40;
    expect(decodeDualSenseInputReport(value, 'dualsense')?.buttons).toEqual(new Set());
  });
});
