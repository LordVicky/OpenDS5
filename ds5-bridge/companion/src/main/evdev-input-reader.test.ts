import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { EvdevInputReader } from './evdev-input-reader';
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
});
