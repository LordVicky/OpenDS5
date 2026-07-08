import { EventEmitter } from 'node:events';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';

const EVENT_SIZE = 24;
const EV_SYN = 0;
const EV_KEY = 1;
const EV_ABS = 3;
const ABS_Z = 2;
const ABS_RZ = 5;

const BUTTON_NAMES: Record<number, string> = {
  0x130: 'cross',
  0x131: 'circle',
  0x133: 'triangle',
  0x134: 'square',
  0x136: 'l1',
  0x137: 'r1',
  0x13d: 'l3',
  0x13e: 'r3'
};

export function findDualSenseEventNode(): string | null {
  let entries: string[];
  try {
    entries = readdirSync('/sys/class/input');
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.startsWith('event')) continue;
    try {
      const name = readFileSync(`/sys/class/input/${entry}/device/name`, 'utf8').trim();
      if (name.toLowerCase().includes('dualsense')) {
        return `/dev/input/${entry}`;
      }
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

  private handleEvent(type: number, code: number, value: number): void {
    if (type === EV_ABS) {
      if (code === ABS_Z) this.l2 = value;
      if (code === ABS_RZ) this.r2 = value;
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
