import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvdevInputReader, findDualSenseEventNode, findDualSenseEventNodes } from './evdev-input-reader';
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
const ABS_HAT0X = 16;
const ABS_HAT0Y = 17;
const BTN_TL = 0x136;
const NEW_CODES = [0x13a, 0x13b, 0x13c, 0x14a, 248, 0x220, 0x221, 0x222, 0x223];

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
  it('normalizes all supported DualSense extra buttons and ignores unknown codes', async () => {
    const stream = new PassThrough(); const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream }); reader.start();
    const pending = collect(reader, 2);
    stream.write(Buffer.concat([...NEW_CODES.map((code) => event(EV_KEY, code, 1)), event(EV_KEY, 999, 1), event(EV_SYN, 0, 0)]));
    stream.write(Buffer.concat([...NEW_CODES.map((code) => event(EV_KEY, code, 0)), event(EV_SYN, 0, 0)]));
    const [pressed, released] = await pending;
    expect(pressed.buttons).toEqual(new Set(['create', 'options', 'ps', 'touchpad', 'mute', 'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right']));
    expect(released.buttons).toEqual(new Set());
  });
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

  it('decodes left-stick ABS_X/ABS_Y into lx/ly', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 1);
    stream.write(Buffer.concat([
      event(EV_ABS, 0, 255),
      event(EV_ABS, 1, 10),
      event(EV_SYN, 0, 0)
    ]));
    const [state] = await pending;
    expect(state.lx).toBe(255);
    expect(state.ly).toBe(10);
  });

  it('reports the stick centered (128) before any stick event arrives', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 1);
    stream.write(Buffer.concat([event(EV_ABS, ABS_RZ, 55), event(EV_SYN, 0, 0)]));
    const [state] = await pending;
    expect(state.lx).toBe(128);
    expect(state.ly).toBe(128);
  });

  it('normalizes the DualSense hat axes into held D-pad buttons', async () => {
    const stream = new PassThrough();
    const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream });
    reader.start();
    const pending = collect(reader, 3);
    stream.write(Buffer.concat([
      event(EV_ABS, ABS_HAT0Y, -1), event(EV_SYN, 0, 0),
      event(EV_ABS, ABS_HAT0Y, 0), event(EV_ABS, ABS_HAT0X, 1), event(EV_SYN, 0, 0),
      event(EV_ABS, ABS_HAT0X, 0), event(EV_SYN, 0, 0)
    ]));
    const [up, right, released] = await pending;
    expect(up.buttons).toEqual(new Set(['dpad-up']));
    expect(right.buttons).toEqual(new Set(['dpad-right']));
    expect(released.buttons).toEqual(new Set());
  });

  it('merges touchpad-click events from the DualSense auxiliary node', async () => {
    const gamepad = new PassThrough();
    const touchpad = new PassThrough();
    const reader = new EvdevInputReader({
      findNodes: () => ['/dev/input/event-gamepad', '/dev/input/event-touchpad'],
      openStream: (path) => path.endsWith('touchpad') ? touchpad : gamepad
    });
    reader.start();
    const pending = collect(reader, 1);
    touchpad.write(Buffer.concat([event(EV_KEY, 272, 1), event(EV_SYN, 0, 0)]));
    const [state] = await pending;
    expect(state.buttons).toEqual(new Set(['touchpad']));
    reader.stop();
  });

  it('merges auxiliary input without clearing the gamepad trigger or buttons', async () => {
    const gamepad = new PassThrough();
    const touchpad = new PassThrough();
    const reader = new EvdevInputReader({
      findNodes: () => ['/dev/input/gamepad', '/dev/input/touchpad'],
      openStream: (devicePath) => devicePath.endsWith('touchpad') ? touchpad : gamepad,
      sourceIdentity: () => 'physical-A'
    });
    reader.start();
    const pending = collect(reader, 2);
    gamepad.write(Buffer.concat([event(EV_ABS, ABS_RZ, 220), event(EV_KEY, BTN_TL, 1), event(EV_SYN, 0, 0)]));
    touchpad.write(Buffer.concat([event(EV_KEY, 272, 1), event(EV_SYN, 0, 0)]));
    const [, auxiliary] = await pending;
    expect(auxiliary.sourceId).toBe('physical-A');
    expect(auxiliary.r2).toBe(220);
    expect(auxiliary.buttons).toEqual(new Set(['l1', 'touchpad']));
    reader.stop();
  });

  it('removes an auxiliary node without disconnecting the physical source until the last node closes', () => {
    const gamepad = new PassThrough();
    const touchpad = new PassThrough();
    const reader = new EvdevInputReader({
      findNodes: () => ['/dev/input/gamepad', '/dev/input/touchpad'],
      openStream: (devicePath) => devicePath.endsWith('touchpad') ? touchpad : gamepad,
      sourceIdentity: () => 'physical-A'
    });
    const disconnect = vi.fn(); reader.on('disconnect', disconnect); reader.start();
    touchpad.emit('close');
    expect(disconnect).not.toHaveBeenCalled();
    gamepad.emit('close');
    expect(disconnect).toHaveBeenCalledOnce();
    reader.stop();
  });

  it('keeps button and axis state isolated for simultaneous streams', async () => {
    const streams = new Map<string, PassThrough>([['A', new PassThrough()], ['B', new PassThrough()]]);
    const reader = new EvdevInputReader({
      findNodes: () => ['/dev/input/A', '/dev/input/B'],
      openStream: (devicePath) => streams.get(devicePath.endsWith('A') ? 'A' : 'B')!,
      sourceIdentity: (devicePath) => devicePath.endsWith('A') ? 'source-A' : 'source-B'
    });
    reader.start();
    const pending = collect(reader, 2);
    streams.get('A')!.write(Buffer.concat([event(EV_ABS, ABS_RZ, 200), event(EV_KEY, BTN_TL, 1), event(EV_SYN, 0, 0)]));
    streams.get('B')!.write(event(EV_SYN, 0, 0));
    const states = await pending;
    expect(states[0]).toMatchObject({ sourceId: 'source-A', r2: 200 });
    expect(states[0].buttons).toEqual(new Set(['l1']));
    expect(states[1]).toMatchObject({ sourceId: 'source-B', r2: 0 });
    expect(states[1].buttons).toEqual(new Set());
    reader.stop();
  });

  it.each(['close', 'end', 'error'] as const)('clears a removed gamepad contribution when its touchpad node remains (%s)', async (removal) => {
    const gamepad = new PassThrough();
    const touchpad = new PassThrough();
    const reader = new EvdevInputReader({
      findNodes: () => ['/dev/input/gamepad', '/dev/input/touchpad'],
      openStream: (devicePath) => devicePath.endsWith('touchpad') ? touchpad : gamepad,
      sourceIdentity: () => 'physical-A'
    });
    reader.start();
    const pending = collect(reader, 2);
    gamepad.write(Buffer.concat([
      event(EV_ABS, ABS_RZ, 220),
      event(EV_KEY, BTN_TL, 1),
      event(EV_KEY, 0x13c, 1),
      event(EV_KEY, 0x13d, 1),
      event(EV_KEY, 0x130, 1),
      event(EV_SYN, 0, 0)
    ]));
    if (removal === 'error') gamepad.emit('error', new Error('gamepad closed with error'));
    else gamepad.emit(removal);
    const [, cleared] = await pending;
    expect(cleared.sourceId).toBe('physical-A');
    expect(cleared.r2).toBe(0);
    expect(cleared.buttons).toEqual(new Set());
    touchpad.write(event(EV_SYN, 0, 0));
    reader.stop();
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

  it('clears buffered data and held state on stop', async () => {
    let stream = new PassThrough(); const reader = new EvdevInputReader({ devicePath: '/fake', openStream: () => stream }); reader.start();
    const pending = collect(reader, 1); stream.write(Buffer.concat([event(EV_KEY, BTN_TL, 1), event(EV_SYN, 0, 0)]));
    const [first] = await pending; expect(first.buttons.has('l1')).toBe(true); reader.stop();
    stream = new PassThrough(); const next = collect(reader, 1); reader.start(); stream.write(event(EV_SYN, 0, 0)); const [reset] = await next; expect(reset.buttons).toEqual(new Set());
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
  function addNode(entry: string, name: string, abs: string, key: string, physicalPath?: string): void {
    const devicePath = path.join(sysDir, entry, 'device');
    if (physicalPath) { mkdirSync(physicalPath, { recursive: true }); mkdirSync(path.dirname(devicePath), { recursive: true }); symlinkSync(physicalPath, devicePath); }
    const capsDir = path.join(physicalPath ?? devicePath, 'capabilities');
    mkdirSync(capsDir, { recursive: true });
    writeFileSync(path.join(physicalPath ?? devicePath, 'name'), `${name}\n`);
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

  it('returns the gamepad and touchpad nodes as one DualSense input group', () => {
    sysDir = mkdtempSync(path.join(tmpdir(), 'sys-input-'));
    addNode('event29', 'Sony Interactive Entertainment DualSense Wireless Controller', '3003f', '7fdb000000000000 0 0 0 0', path.join(sysDir, 'physical', 'input', 'input29'));
    addNode('event31', 'Sony Interactive Entertainment DualSense Wireless Controller Touchpad', '2608000 3', '2420 10000 0 0 0 0', path.join(sysDir, 'physical', 'input', 'input31'));
    expect(findDualSenseEventNodes(sysDir)).toEqual(['/dev/input/event29', '/dev/input/event31']);
  });

  it('returns null when no node has both trigger axes and buttons', () => {
    sysDir = mkdtempSync(path.join(tmpdir(), 'sys-input-'));
    addNode('event256', 'Sony Interactive Entertainment DualSense Wireless Controller Headset Jack', '0', '0');
    addNode('event30', 'Sony Interactive Entertainment DualSense Wireless Controller Motion Sensors', '3f', '0');
    expect(findDualSenseEventNode(sysDir)).toBeNull();
  });
});
