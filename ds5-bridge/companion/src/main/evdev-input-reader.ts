import { EventEmitter } from 'node:events';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';

const EVENT_SIZE = 24;
const EV_SYN = 0;
const EV_KEY = 1;
const EV_ABS = 3;
const ABS_Z = 2;
const ABS_RZ = 5;
const ABS_HAT0X = 16;
const ABS_HAT0Y = 17;

const BUTTON_NAMES: Record<number, string> = {
  0x130: 'cross',
  0x131: 'circle',
  0x133: 'triangle',
  0x134: 'square',
  0x136: 'l1',
  0x137: 'r1',
  0x13a: 'create',
  0x13b: 'options',
  0x13c: 'ps',
  0x13d: 'l3',
  0x13e: 'r3'
};

// Lowest word of the abs capability bitmask; bit 2 = ABS_Z (L2),
// bit 5 = ABS_RZ (R2).
const TRIGGER_ABS_MASK = BigInt((1 << ABS_Z) | (1 << ABS_RZ));

function lowestCapabilityWord(raw: string): bigint {
  const words = raw.trim().split(/\s+/);
  try {
    return BigInt(`0x${words[words.length - 1]}`);
  } catch {
    return 0n;
  }
}

function hasAnyCapabilityBit(raw: string): boolean {
  return raw
    .trim()
    .split(/\s+/)
    .some((word) => {
      try {
        return BigInt(`0x${word}`) !== 0n;
      } catch {
        return false;
      }
    });
}

export function findDualSenseEventNode(sysInputDir = '/sys/class/input'): string | null {
  let entries: string[];
  try {
    entries = readdirSync(sysInputDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.startsWith('event')) continue;
    try {
      const name = readFileSync(`${sysInputDir}/${entry}/device/name`, 'utf8').trim();
      if (!name.toLowerCase().includes('dualsense')) continue;
      // The DualSense exposes several nodes that all match by name (gamepad,
      // touchpad, motion sensors, headset jack). Only the gamepad has both
      // trigger axes and button capabilities.
      const abs = lowestCapabilityWord(
        readFileSync(`${sysInputDir}/${entry}/device/capabilities/abs`, 'utf8')
      );
      if ((abs & TRIGGER_ABS_MASK) !== TRIGGER_ABS_MASK) continue;
      const key = readFileSync(`${sysInputDir}/${entry}/device/capabilities/key`, 'utf8');
      if (!hasAnyCapabilityBit(key)) continue;
      return `/dev/input/${entry}`;
    } catch {
      // ignore unreadable nodes
    }
  }
  return null;
}

type ReaderOptions = {
  devicePath?: string;
  openStream?: (path: string) => NodeJS.ReadableStream;
  findNode?: () => string | null;
};

export class EvdevInputReader extends EventEmitter {
  private readonly explicitDevicePath: string | null;
  private readonly openStream: (path: string) => NodeJS.ReadableStream;
  private readonly findNode: () => string | null;
  private stream: NodeJS.ReadableStream | null = null;
  private pending: Buffer = Buffer.alloc(0);
  private l2 = 0;
  private r2 = 0;
  private buttons = new Set<string>();

  constructor(options: ReaderOptions = {}) {
    super();
    this.explicitDevicePath = options.devicePath ?? null;
    this.openStream = options.openStream ?? ((path) => createReadStream(path));
    this.findNode = options.findNode ?? findDualSenseEventNode;
  }

  start(): void {
    if (this.stream) return;
    const devicePath = this.explicitDevicePath ?? this.findNode();
    if (!devicePath) {
      this.emit('error', new Error('No DualSense evdev node found.'));
      return;
    }
    const stream = this.openStream(devicePath);
    this.stream = stream;
    stream.on('data', (chunk: Buffer) => this.consume(chunk));
    stream.on('error', (error: Error) => {
      if (this.stream === stream) {
        this.stream = null;
      }
      this.emit('error', error);
    });
  }

  stop(): void {
    if (this.stream && 'destroy' in this.stream) {
      (this.stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
    }
    this.stream = null;
    this.pending = Buffer.alloc(0);
  }

  private consume(chunk: Buffer): void {
    this.pending = this.pending.length === 0 ? chunk : (Buffer.concat([this.pending, chunk]) as Buffer);
    while (this.pending.length >= EVENT_SIZE) {
      const record = this.pending.subarray(0, EVENT_SIZE);
      this.pending = this.pending.subarray(EVENT_SIZE);
      this.handleEvent(record.readUInt16LE(16), record.readUInt16LE(18), record.readInt32LE(20));
    }
  }

  // The d-pad is a hat axis, not key events; -1/0/1 per axis becomes a pair of
  // synthetic button names so the switch/modifier layers see one vocabulary.
  private setHatButtons(negative: string, positive: string, value: number): void {
    this.buttons.delete(negative);
    this.buttons.delete(positive);
    if (value < 0) this.buttons.add(negative);
    if (value > 0) this.buttons.add(positive);
  }

  private handleEvent(type: number, code: number, value: number): void {
    if (type === EV_ABS) {
      if (code === ABS_Z) this.l2 = value;
      if (code === ABS_RZ) this.r2 = value;
      if (code === ABS_HAT0X) this.setHatButtons('dpad-left', 'dpad-right', value);
      if (code === ABS_HAT0Y) this.setHatButtons('dpad-up', 'dpad-down', value);
      return;
    }
    if (type === EV_KEY) {
      const name = BUTTON_NAMES[code];
      if (!name) return;
      if (value !== 0) this.buttons.add(name);
      else this.buttons.delete(name);
      return;
    }
    if (type === EV_SYN) {
      const state: ControllerInputState = {
        timestampMs: Date.now(),
        l2: this.l2,
        r2: this.r2,
        buttons: new Set(this.buttons)
      };
      this.emit('input', state);
    }
  }
}
