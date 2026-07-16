import { EventEmitter } from 'node:events';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';

const EVENT_SIZE = 24;
const EV_SYN = 0;
const EV_KEY = 1;
const EV_ABS = 3;
const ABS_X = 0;
const ABS_Y = 1;
const ABS_Z = 2;
const ABS_RZ = 5;
const ABS_HAT0X = 16;
const ABS_HAT0Y = 17;

// Codes verified against /usr/include/linux/input-event-codes.h. DualSense's
// physical gamepad node reports its extra controls using these generic evdev
// names; the node selector below excludes the touchpad/sensor/headset nodes.
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
  0x13e: 'r3',
  0x14a: 'touchpad',
  272: 'touchpad',
  248: 'mute',
  0x220: 'dpad-up',
  0x221: 'dpad-down',
  0x222: 'dpad-left',
  0x223: 'dpad-right'
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

export function findDualSenseEventNodes(sysInputDir = '/sys/class/input'): string[] {
  let entries: string[];
  try {
    entries = readdirSync(sysInputDir);
  } catch {
    return [];
  }
  let gamepad: string | null = null;
  let touchpad: string | null = null;
  for (const entry of entries) {
    if (!entry.startsWith('event')) continue;
    try {
      const name = readFileSync(`${sysInputDir}/${entry}/device/name`, 'utf8').trim();
      if (!name.toLowerCase().includes('dualsense')) continue;
      if (name.toLowerCase().includes('touchpad')) {
        touchpad ??= `/dev/input/${entry}`;
        continue;
      }
      // The DualSense exposes several nodes that all match by name (gamepad,
      // touchpad, motion sensors, headset jack). Only the gamepad has both
      // trigger axes and button capabilities.
      const abs = lowestCapabilityWord(
        readFileSync(`${sysInputDir}/${entry}/device/capabilities/abs`, 'utf8')
      );
      if ((abs & TRIGGER_ABS_MASK) !== TRIGGER_ABS_MASK) continue;
      const key = readFileSync(`${sysInputDir}/${entry}/device/capabilities/key`, 'utf8');
      if (!hasAnyCapabilityBit(key)) continue;
      gamepad ??= `/dev/input/${entry}`;
    } catch {
      // ignore unreadable nodes
    }
  }
  return gamepad ? [gamepad, ...(touchpad ? [touchpad] : [])] : [];
}

export function findDualSenseEventNode(sysInputDir = '/sys/class/input'): string | null {
  return findDualSenseEventNodes(sysInputDir)[0] ?? null;
}

type ReaderOptions = {
  devicePath?: string;
  openStream?: (path: string) => NodeJS.ReadableStream;
  findNode?: () => string | null;
  findNodes?: () => string[];
};

export class EvdevInputReader extends EventEmitter {
  private readonly explicitDevicePath: string | null;
  private readonly openStream: (path: string) => NodeJS.ReadableStream;
  private readonly findNode: () => string | null;
  private readonly findNodes: (() => string[]) | null;
  private streams: Array<{ stream: NodeJS.ReadableStream; pending: Buffer }> = [];
  private l2 = 0;
  private r2 = 0;
  private lx = 128;
  private ly = 128;
  private dpadX = 0;
  private dpadY = 0;
  private buttons = new Set<ControllerButton>();

  constructor(options: ReaderOptions = {}) {
    super();
    this.explicitDevicePath = options.devicePath ?? null;
    this.openStream = options.openStream ?? ((path) => createReadStream(path));
    this.findNode = options.findNode ?? findDualSenseEventNode;
    this.findNodes = options.findNodes ?? (options.findNode ? null : findDualSenseEventNodes);
  }

  start(): void {
    if (this.streams.length > 0) return;
    const devicePaths = this.explicitDevicePath
      ? [this.explicitDevicePath]
      : this.findNodes?.() ?? (() => { const node = this.findNode(); return node ? [node] : []; })();
    if (devicePaths.length === 0) {
      this.emit('error', new Error('No DualSense evdev node found.'));
      return;
    }
    for (const devicePath of devicePaths) {
      const stream = this.openStream(devicePath);
      const source = { stream, pending: Buffer.alloc(0) };
      this.streams.push(source);
      stream.on('data', (chunk: Buffer) => this.consume(source, chunk));
      stream.on('error', (error: Error) => {
        this.streams = this.streams.filter((current) => current !== source);
        if (this.streams.length === 0) this.emit('error', error);
      });
    }
  }

  stop(): void {
    for (const { stream } of this.streams) {
      if ('destroy' in stream) {
        (stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
      }
    }
    this.streams = [];
    this.buttons.clear();
    this.l2 = 0;
    this.r2 = 0;
    this.dpadX = 0;
    this.dpadY = 0;
  }

  private consume(source: { pending: Buffer }, chunk: Buffer): void {
    source.pending = source.pending.length === 0 ? chunk : (Buffer.concat([source.pending, chunk]) as Buffer);
    while (source.pending.length >= EVENT_SIZE) {
      const record = source.pending.subarray(0, EVENT_SIZE);
      source.pending = source.pending.subarray(EVENT_SIZE);
      this.handleEvent(record.readUInt16LE(16), record.readUInt16LE(18), record.readInt32LE(20));
    }
  }

  private handleEvent(type: number, code: number, value: number): void {
    if (type === EV_ABS) {
      if (code === ABS_X) this.lx = value;
      if (code === ABS_Y) this.ly = value;
      if (code === ABS_Z) this.l2 = value;
      if (code === ABS_RZ) this.r2 = value;
      if (code === ABS_HAT0X || code === ABS_HAT0Y) {
        if (code === ABS_HAT0X) this.dpadX = Math.max(-1, Math.min(1, value));
        else this.dpadY = Math.max(-1, Math.min(1, value));
        this.buttons.delete('dpad-left');
        this.buttons.delete('dpad-right');
        this.buttons.delete('dpad-up');
        this.buttons.delete('dpad-down');
        if (this.dpadX < 0) this.buttons.add('dpad-left');
        if (this.dpadX > 0) this.buttons.add('dpad-right');
        if (this.dpadY < 0) this.buttons.add('dpad-up');
        if (this.dpadY > 0) this.buttons.add('dpad-down');
      }
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
        lx: this.lx,
        ly: this.ly,
        buttons: new Set(this.buttons)
      };
      this.emit('input', state);
    }
  }
}
