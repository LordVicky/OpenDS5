import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvdevInputReader, findDualSenseEventNode } from './evdev-input-reader';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';

function event(type: number, code: number, value: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt16LE(type, 16);
  buffer.writeUInt16LE(code, 18);
  buffer.writeInt32LE(value, 20);
  return buffer;
}

const EV_SYN = 0;
const EV_KEY = 1;
const EV_ABS = 3;
const ABS_RZ = 5;
const BTN_TL = 0x136;

async function collect(reader: EvdevInputReader, count: number): Promise<ControllerInputState[]> {
  const states: ControllerInputState[] = [];
  return new Promise((resolve) => {
    reader.on('input', (state: ControllerInputState) => {
      states.push(state);
      if (states.length >= count) resolve(states);
    });
  });
}

describe('EvdevInputReader', () => {
  it('accumulates axis and button events and emits state on EV_SYN', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 1);
    stream.write(Buffer.concat([
      event(EV_ABS, ABS_RZ, 200),
      event(EV_KEY, BTN_TL, 1),
      event(EV_SYN, 0, 0)
    ]));
    const [state] = await pending;
    expect(state.r2).toBe(200);
    expect(state.l2).toBe(0);
    expect(state.buttons.has('l1')).toBe(true);
  });

  it('handles packets split across chunk boundaries', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 1);
    const packet = Buffer.concat([event(EV_ABS, ABS_RZ, 55), event(EV_SYN, 0, 0)]);
    stream.write(packet.subarray(0, 30));
    stream.write(packet.subarray(30));
    const [state] = await pending;
    expect(state.r2).toBe(55);
  });

  it('clears buttons on release', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 2);
    stream.write(Buffer.concat([event(EV_KEY, BTN_TL, 1), event(EV_SYN, 0, 0)]));
    stream.write(Buffer.concat([event(EV_KEY, BTN_TL, 0), event(EV_SYN, 0, 0)]));
    const [first, second] = await pending;
    expect(first.buttons.has('l1')).toBe(true);
    expect(second.buttons.has('l1')).toBe(false);
  });

  it('reports create, options, and ps buttons', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 1);
    stream.write(Buffer.concat([
      event(EV_KEY, 0x13a, 1),
      event(EV_KEY, 0x13b, 1),
      event(EV_KEY, 0x13c, 1),
      event(EV_SYN, 0, 0)
    ]));
    const [state] = await pending;
    expect(state.buttons.has('create')).toBe(true);
    expect(state.buttons.has('options')).toBe(true);
    expect(state.buttons.has('ps')).toBe(true);
  });

  it('synthesizes d-pad buttons from the hat axes and clears them on center', async () => {
    const ABS_HAT0X = 16;
    const ABS_HAT0Y = 17;
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 3);
    stream.write(Buffer.concat([event(EV_ABS, ABS_HAT0X, 1), event(EV_ABS, ABS_HAT0Y, -1), event(EV_SYN, 0, 0)]));
    stream.write(Buffer.concat([event(EV_ABS, ABS_HAT0X, -1), event(EV_SYN, 0, 0)]));
    stream.write(Buffer.concat([event(EV_ABS, ABS_HAT0X, 0), event(EV_ABS, ABS_HAT0Y, 0), event(EV_SYN, 0, 0)]));
    const [first, second, third] = await pending;
    expect(first.buttons.has('dpad-right')).toBe(true);
    expect(first.buttons.has('dpad-up')).toBe(true);
    expect(second.buttons.has('dpad-left')).toBe(true);
    expect(second.buttons.has('dpad-right')).toBe(false);
    expect(second.buttons.has('dpad-up')).toBe(true);
    expect(third.buttons.has('dpad-left')).toBe(false);
    expect(third.buttons.has('dpad-up')).toBe(false);
  });

  it('resolves the device path lazily on each start() rather than once at construction', () => {
    const stream = new PassThrough();
    let resolved: string | null = null;
    const findNode = vi.fn(() => resolved);
    const reader = new EvdevInputReader({ openStream: () => stream, findNode });

    const errors: Error[] = [];
    reader.on('error', (error: Error) => errors.push(error));

    reader.start();
    expect(errors).toHaveLength(1);
    expect(findNode).toHaveBeenCalledTimes(1);

    resolved = '/dev/input/event7';
    reader.start();
    expect(findNode).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(1);
  });

  it('prefers an explicit devicePath over findNode', () => {
    const stream = new PassThrough();
    const findNode = vi.fn(() => '/dev/input/eventX');
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream, findNode });
    reader.start();
    expect(findNode).not.toHaveBeenCalled();
  });
});

describe('findDualSenseEventNode', () => {
  let sysDir: string;

  afterEach(() => rmSync(sysDir, { recursive: true, force: true }));

  // Values captured from real hardware: the DualSense exposes four evdev
  // nodes whose names all contain "DualSense" — only the gamepad has both
  // trigger axes (abs bits 2 and 5) and button (key) capabilities.
  function addNode(entry: string, name: string, abs: string, key: string): void {
    const capsDir = path.join(sysDir, entry, 'device', 'capabilities');
    mkdirSync(capsDir, { recursive: true });
    writeFileSync(path.join(sysDir, entry, 'device', 'name'), `${name}\n`);
    writeFileSync(path.join(capsDir, 'abs'), `${abs}\n`);
    writeFileSync(path.join(capsDir, 'key'), `${key}\n`);
  }

  it('picks the gamepad node, not the headset jack, motion sensors, or touchpad', () => {
    sysDir = mkdtempSync(path.join(tmpdir(), 'sys-input-'));
    // Lexicographic readdir order puts event256 (headset jack) first.
    addNode('event256', 'Sony Interactive Entertainment DualSense Wireless Controller Headset Jack', '0', '0');
    addNode('event29', 'Sony Interactive Entertainment DualSense Wireless Controller', '3003f', '7fdb000000000000 0 0 0 0');
    addNode('event30', 'Sony Interactive Entertainment DualSense Wireless Controller Motion Sensors', '3f', '0');
    addNode('event31', 'Sony Interactive Entertainment DualSense Wireless Controller Touchpad', '2608000 3', '2420 10000 0 0 0 0');
    expect(findDualSenseEventNode(sysDir)).toBe('/dev/input/event29');
  });

  it('returns null when no node has both trigger axes and buttons', () => {
    sysDir = mkdtempSync(path.join(tmpdir(), 'sys-input-'));
    addNode('event256', 'Sony Interactive Entertainment DualSense Wireless Controller Headset Jack', '0', '0');
    addNode('event30', 'Sony Interactive Entertainment DualSense Wireless Controller Motion Sensors', '3f', '0');
    expect(findDualSenseEventNode(sysDir)).toBeNull();
  });
});
