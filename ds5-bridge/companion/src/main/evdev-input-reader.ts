import { EventEmitter } from 'node:events';
import { createReadStream, readdirSync, readFileSync, realpathSync } from 'node:fs';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';
import type { ControllerButton } from '../shared/controller-input';
import { resolveEvdevSourceIdentity } from './controller-source-identity';

const EVENT_SIZE = 24;
const EV_SYN = 0;
const EV_KEY = 1;
const EV_ABS = 3;
const ABS_Z = 2;
const ABS_RZ = 5;
const ABS_HAT0X = 16;
const ABS_HAT0Y = 17;

// Codes verified against /usr/include/linux/input-event-codes.h. DualSense's
// physical gamepad node reports its extra controls using these generic evdev
// names; the node selector below excludes the touchpad/sensor/headset nodes.
const BUTTON_NAMES: Record<number, ControllerButton> = {
  0x130: 'cross',
  0x131: 'circle',
  0x133: 'triangle',
  0x134: 'square',
  0x136: 'l1',
  0x137: 'r1',
  0x13d: 'l3',
  0x13e: 'r3',
  0x13a: 'create',
  0x13b: 'options',
  0x13c: 'ps',
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
  const groups = new Map<string, { gamepad: string | null; touchpad: string | null }>();
  for (const entry of entries) {
    if (!entry.startsWith('event')) continue;
    try {
      const name = readFileSync(`${sysInputDir}/${entry}/device/name`, 'utf8').trim();
      if (!name.toLowerCase().includes('dualsense')) continue;
      const devicePath = `${sysInputDir}/${entry}/device`;
      const identity = (() => { try { return realpathSync(devicePath).replace(/\/input\/input\d+$/, ''); } catch { return devicePath; } })();
      const group = groups.get(identity) ?? { gamepad: null, touchpad: null };
      if (name.toLowerCase().includes('touchpad')) {
        group.touchpad ??= `/dev/input/${entry}`;
        groups.set(identity, group);
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
      group.gamepad ??= `/dev/input/${entry}`;
      groups.set(identity, group);
    } catch {
      // ignore unreadable nodes
    }
  }
  return [...groups.values()].flatMap(({ gamepad, touchpad }) => gamepad ? [gamepad, ...(touchpad ? [touchpad] : [])] : []);
}

export function findDualSenseEventNode(sysInputDir = '/sys/class/input'): string | null {
  return findDualSenseEventNodes(sysInputDir)[0] ?? null;
}

type ReaderOptions = {
  devicePath?: string;
  openStream?: (path: string) => NodeJS.ReadableStream;
  findNode?: () => string | null;
  findNodes?: () => string[];
  sourceIdentity?: (path: string) => string | null;
};

export class EvdevInputReader extends EventEmitter {
  private readonly explicitDevicePath: string | null;
  private readonly openStream: (path: string) => NodeJS.ReadableStream;
  private readonly findNode: () => string | null;
  private readonly findNodes: (() => string[]) | null;
  private readonly sourceIdentity: (path: string) => string | null;
  private streams: Array<{ stream: NodeJS.ReadableStream; pending: Buffer; removed: boolean; intentionalStop: boolean; group: InputGroup; state: NodeInputState }> = [];
  private stopping = false;

  constructor(options: ReaderOptions = {}) {
    super();
    this.explicitDevicePath = options.devicePath ?? null;
    this.openStream = options.openStream ?? ((path) => createReadStream(path));
    this.findNode = options.findNode ?? findDualSenseEventNode;
    this.findNodes = options.findNodes ?? (options.findNode ? null : findDualSenseEventNodes);
    this.sourceIdentity = options.sourceIdentity ?? resolveEvdevSourceIdentity;
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
    this.stopping = false;
    const groups = new Map<string, InputGroup>();
    for (const devicePath of devicePaths) {
      const stream = this.openStream(devicePath);
      const sourceId = this.sourceIdentity(devicePath) ?? `evdev:${devicePath}`;
      const group = groups.get(sourceId) ?? { sourceId, nodes: new Set<NodeInputState>() };
      groups.set(sourceId, group);
      const state: NodeInputState = { l2: 0, r2: 0, dpadX: 0, dpadY: 0, buttons: new Set<ControllerButton>() };
      group.nodes.add(state);
      const source = { stream, pending: Buffer.alloc(0), removed: false, intentionalStop: false, group, state };
      this.streams.push(source);
      stream.on('data', (chunk: Buffer) => this.consume(source, chunk));
      const remove = (error?: Error) => this.removeStream(source, error);
      stream.on('error', remove);
      stream.on('close', () => remove());
      stream.on('end', () => remove());
    }
  }

  stop(): void {
    this.stopping = true;
    for (const source of this.streams) {
      source.intentionalStop = true;
      const { stream } = source;
      if ('destroy' in stream) {
        (stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
      }
    }
    this.streams = [];
  }

  getConnectedSourceCount(): number { return new Set(this.streams.map((source) => source.group.sourceId)).size; }

  private removeStream(source: (typeof this.streams)[number], error?: Error): void {
    if (source.removed) return;
    source.removed = true;
    this.streams = this.streams.filter((current) => current !== source);
    source.group.nodes.delete(source.state);
    const groupRemains = this.streams.some((current) => current.group === source.group);
    if (groupRemains && !this.stopping && !source.intentionalStop) this.emit('input', this.snapshot(source.group));
    if (!groupRemains && !this.stopping && !source.intentionalStop) this.emit('disconnect', source.group.sourceId);
    if (error && !this.stopping && !source.intentionalStop && this.streams.length === 0) this.emit('error', error);
  }

  private consume(source: (typeof this.streams)[number], chunk: Buffer): void {
    if (source.removed) return;
    source.pending = source.pending.length === 0 ? chunk : (Buffer.concat([source.pending, chunk]) as Buffer);
    while (source.pending.length >= EVENT_SIZE) {
      const record = source.pending.subarray(0, EVENT_SIZE);
      source.pending = source.pending.subarray(EVENT_SIZE);
      this.handleEvent(source, record.readUInt16LE(16), record.readUInt16LE(18), record.readInt32LE(20));
    }
  }

  private handleEvent(source: (typeof this.streams)[number], type: number, code: number, value: number): void {
    if (type === EV_ABS) {
      if (code === ABS_Z) source.state.l2 = value;
      if (code === ABS_RZ) source.state.r2 = value;
      if (code === ABS_HAT0X || code === ABS_HAT0Y) {
        if (code === ABS_HAT0X) source.state.dpadX = Math.max(-1, Math.min(1, value));
        else source.state.dpadY = Math.max(-1, Math.min(1, value));
        source.state.buttons.delete('dpad-left'); source.state.buttons.delete('dpad-right'); source.state.buttons.delete('dpad-up'); source.state.buttons.delete('dpad-down');
        if (source.state.dpadX < 0) source.state.buttons.add('dpad-left');
        if (source.state.dpadX > 0) source.state.buttons.add('dpad-right');
        if (source.state.dpadY < 0) source.state.buttons.add('dpad-up');
        if (source.state.dpadY > 0) source.state.buttons.add('dpad-down');
      }
      return;
    }
    if (type === EV_KEY) {
      const name = BUTTON_NAMES[code];
      if (!name) return;
      if (value !== 0) source.state.buttons.add(name);
      else source.state.buttons.delete(name);
      return;
    }
    if (type === EV_SYN) {
      this.emit('input', this.snapshot(source.group));
    }
  }

  private snapshot(group: InputGroup): ControllerInputState {
    return {
      timestampMs: Date.now(),
      sourceId: group.sourceId,
      l2: Math.max(...[...group.nodes].map((node) => node.l2), 0),
      r2: Math.max(...[...group.nodes].map((node) => node.r2), 0),
      lx: 128,
      ly: 128,
      buttons: new Set([...group.nodes].flatMap((node) => [...node.buttons]))
    };
  }
}

type InputGroup = {
  sourceId: string;
  nodes: Set<NodeInputState>;
};

type NodeInputState = {
  l2: number;
  r2: number;
  dpadX: number;
  dpadY: number;
  buttons: Set<ControllerButton>;
};
