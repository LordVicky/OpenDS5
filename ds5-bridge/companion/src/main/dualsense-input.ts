import { EventEmitter } from 'node:events';
import HID from 'node-hid';
import type { ControllerButton } from '../shared/controller-input';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';
import { classifyControllerDevice, controllerCapabilitiesForModel, type ControllerDeviceClassification } from './controller-device';
import { resolveHidSourceIdentity } from './controller-source-identity';
import { EvdevInputReader } from './evdev-input-reader';

export const DUALSENSE_USB_REPORT_ID = 0x01;
export const DUALSENSE_BT_REPORT_ID = 0x31;
export const DUALSENSE_USB_REPORT_SIZE = 64;
export const DUALSENSE_BT_REPORT_SIZE = 78;
const EDGE_HID_RESCAN_DELAY_MS = 5000;

export interface DualSenseTouchPoint { active: boolean; id: number; x: number; y: number; }
export interface DualSenseInputReport extends ControllerInputState {
  model: ControllerDeviceClassification['model'];
  rx: number;
  ry: number;
  gyro: readonly [number, number, number];
  accel: readonly [number, number, number];
  touches: readonly [DualSenseTouchPoint, DualSenseTouchPoint];
}

function crc32(bytes: ArrayLike<number>): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index] & 0xff;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}

function validCrc(report: ArrayLike<number>): boolean {
  const crcOffset = report.length - 4;
  const expected = (report[crcOffset] | (report[crcOffset + 1] << 8) | (report[crcOffset + 2] << 16) | (report[crcOffset + 3] << 24)) >>> 0;
  const seeded = crc32(new Uint8Array([0xa1, ...Array.from({ length: crcOffset }, (_, index) => report[index])]));
  return seeded === expected;
}

function signed16(report: ArrayLike<number>, offset: number): number {
  const value = (report[offset] | (report[offset + 1] << 8)) & 0xffff;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function touch(report: ArrayLike<number>, offset: number): DualSenseTouchPoint {
  const contact = report[offset];
  return {
    active: (contact & 0x80) === 0,
    id: contact & 0x7f,
    x: report[offset + 1] | ((report[offset + 2] & 0x0f) << 8),
    y: ((report[offset + 2] >>> 4) & 0x0f) | (report[offset + 3] << 4)
  };
}

function dpadButtons(value: number): ControllerButton[] {
  const directions: readonly (readonly [ControllerButton, ControllerButton?])[] = [
    ['dpad-up'], ['dpad-up', 'dpad-right'], ['dpad-right'], ['dpad-down', 'dpad-right'],
    ['dpad-down'], ['dpad-down', 'dpad-left'], ['dpad-left'], ['dpad-up', 'dpad-left']
  ];
  return value < directions.length ? directions[value].filter((button): button is ControllerButton => button !== undefined) : [];
}

/** Decodes the complete USB or Bluetooth DualSense input report, or null when unsafe/unsupported. */
export function decodeDualSenseInputReport(
  input: ArrayLike<number>,
  model: ControllerDeviceClassification['model'] = 'dualsense-edge'
): DualSenseInputReport | null {
  const raw = Array.from({ length: input.length }, (_, index) => input[index] & 0xff);
  // Some raw HID stacks expose the Bluetooth HCI transport byte (A1) in front
  // of the HID report; node-hid normally does not. Accept both forms.
  const report = raw[0] === 0xa1 && raw[1] === DUALSENSE_BT_REPORT_ID ? raw.slice(1) : raw;
  const isUsb = report.length === DUALSENSE_USB_REPORT_SIZE && report[0] === DUALSENSE_USB_REPORT_ID;
  const isBluetooth = report.length === DUALSENSE_BT_REPORT_SIZE && report[0] === DUALSENSE_BT_REPORT_ID;
  if (!isUsb && !isBluetooth) return null;
  if (isBluetooth && !validCrc(report)) return null;

  const base = isUsb ? 1 : 3;
  const buttons0 = report[base + 7];
  const buttons1 = report[base + 8];
  const buttons2 = report[base + 9];
  const buttons = new Set<ControllerButton>(dpadButtons(buttons0 & 0x0f));
  const add = (mask: number, button: ControllerButton, byte: number) => { if ((byte & mask) !== 0) buttons.add(button); };
  add(0x10, 'square', buttons0); add(0x20, 'cross', buttons0); add(0x40, 'circle', buttons0); add(0x80, 'triangle', buttons0);
  add(0x01, 'l1', buttons1); add(0x02, 'r1', buttons1); add(0x04, 'l2', buttons1); add(0x08, 'r2', buttons1);
  add(0x10, 'create', buttons1); add(0x20, 'options', buttons1); add(0x40, 'l3', buttons1); add(0x80, 'r3', buttons1);
  add(0x01, 'ps', buttons2); add(0x02, 'touchpad', buttons2); add(0x04, 'mute', buttons2);
  const capabilities = controllerCapabilitiesForModel(model);
  if (capabilities.hasEdgeFunctionButtons || capabilities.hasRearButtons) {
    add(0x10, 'lfn', buttons2); add(0x20, 'rfn', buttons2); add(0x40, 'lb', buttons2); add(0x80, 'rb', buttons2);
  }
  return {
    timestampMs: Date.now(),
    sourceId: null,
    model,
    l2: report[base + 4], r2: report[base + 5],
    lx: report[base], ly: report[base + 1], rx: report[base + 2], ry: report[base + 3], buttons,
    gyro: [signed16(report, base + 15), signed16(report, base + 17), signed16(report, base + 19)],
    accel: [signed16(report, base + 21), signed16(report, base + 23), signed16(report, base + 25)],
    touches: [touch(report, base + 32), touch(report, base + 36)]
  };
}

interface HidReadable {
  on(event: 'data', listener: (data: Buffer) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  close(): void;
}

/** Edge-only raw HID source. Standard DualSense stays exclusively on evdev. */
export class DualSenseEdgeHidInputReader extends EventEmitter {
  private readonly devices = new Map<string, { hid: HidReadable; sourceId: string }>();
  private readonly sourcePathCounts = new Map<string, number>();
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private readonly open: (path: string) => HidReadable;
  private readonly enumerate: () => HID.Device[];
  private readonly sourceIdentity: (path: string) => string | null;

  constructor(options: { enumerate?: () => HID.Device[]; open?: (path: string) => HidReadable; sourceIdentity?: (path: string) => string | null } = {}) {
    super();
    this.enumerate = options.enumerate ?? (() => HID.devices());
    this.open = options.open ?? ((path) => new HID.HID(path));
    this.sourceIdentity = options.sourceIdentity ?? resolveHidSourceIdentity;
  }

  start(): void {
    this.stopping = false;
    for (const device of this.enumerate()) {
      const classification = classifyControllerDevice(device);
      if (!classification.capabilities.hasEdgeFunctionButtons && !classification.capabilities.hasRearButtons) continue;
      if (!device.path) continue;
      if (this.devices.has(device.path)) continue;
      try {
        const hid = this.open(device.path);
        // The identity join is what lets the fan-out reader suppress the
        // matching evdev stream. Fail closed when sysfs cannot prove the join;
        // emitting both streams would create duplicate standard button edges.
        const sourceId = this.sourceIdentity(device.path);
        if (!sourceId) { hid.close(); continue; }
        const path = device.path;
        const pathCount = this.sourcePathCounts.get(sourceId) ?? 0;
        this.sourcePathCounts.set(sourceId, pathCount + 1);
        if (pathCount === 0) this.emit('source', sourceId);
        hid.on('data', (data) => {
          const state = decodeDualSenseInputReport(data, classification.model);
          if (state) this.emit('input', { ...state, sourceId });
        });
        hid.on('error', () => this.remove(path));
        this.devices.set(path, { hid, sourceId });
      } catch {
        // Device races and permission failures are expected during hotplug.
      }
    }
    // No Edge is a normal state: standard DualSense input remains on evdev.
  }

  stop(): void {
    this.stopping = true;
    if (this.rescanTimer !== null) { clearTimeout(this.rescanTimer); this.rescanTimer = null; }
    const devices = [...this.devices.values()];
    const sourceIds = [...this.sourcePathCounts.keys()];
    this.devices.clear();
    this.sourcePathCounts.clear();
    for (const sourceId of sourceIds) this.emit('source-removed', sourceId);
    for (const { hid } of devices) { try { hid.close(); } catch { /* already disconnected */ } }
  }

  private remove(path: string): void {
    const entry = this.devices.get(path);
    if (!entry) return;
    this.devices.delete(path);
    try { entry.hid.close(); } catch { /* already disconnected */ }
    const remaining = (this.sourcePathCounts.get(entry.sourceId) ?? 1) - 1;
    if (remaining > 0) {
      this.sourcePathCounts.set(entry.sourceId, remaining);
      this.scheduleRescan();
      return;
    }
    this.sourcePathCounts.delete(entry.sourceId);
    this.emit('source-removed', entry.sourceId);
    this.emit('disconnect', entry.sourceId);
    this.scheduleRescan();
  }

  private scheduleRescan(): void {
    if (this.stopping || this.rescanTimer !== null) return;
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null;
      if (!this.stopping) this.start();
    }, EDGE_HID_RESCAN_DELAY_MS);
  }
}

/** Keeps evdev as the standard path and replaces only Edge sources with raw HID. */
export class DualSenseShortcutInputReader extends EventEmitter {
  private readonly evdev: EvdevInputReader;
  private readonly edge: DualSenseEdgeHidInputReader;
  private readonly edgeSourceIds = new Set<string>();
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onEvdevInput = (state: ControllerInputState) => {
    if (!state.sourceId || !this.edgeSourceIds.has(state.sourceId)) this.emit('input', state);
  };
  private readonly onEvdevDisconnect = (sourceId: string) => {
    if (!this.edgeSourceIds.has(sourceId)) this.emit('disconnect', sourceId);
  };
  private readonly onReaderError = (error: Error) => {
    this.emit('error', error);
    if (this.users > 0 && this.rescanTimer === null) {
      this.rescanTimer = setTimeout(() => {
        this.rescanTimer = null;
        this.edge.start();
        this.evdev.start();
      }, 5000);
    }
  };

  constructor(options: { evdev?: EvdevInputReader; edge?: DualSenseEdgeHidInputReader } = {}) {
    super();
    this.evdev = options.evdev ?? new EvdevInputReader();
    this.edge = options.edge ?? new DualSenseEdgeHidInputReader();
    this.evdev.on('input', this.onEvdevInput);
    this.evdev.on('disconnect', this.onEvdevDisconnect);
    this.evdev.on('error', this.onReaderError);
    this.edge.on('input', (state: ControllerInputState) => this.emit('input', state));
    this.edge.on('source', (sourceId: string) => this.edgeSourceIds.add(sourceId));
    this.edge.on('source-removed', (sourceId: string) => this.edgeSourceIds.delete(sourceId));
    this.edge.on('disconnect', (sourceId: string) => this.emit('disconnect', sourceId));
    this.edge.on('error', this.onReaderError);
  }

  private users = 0;

  start(): void {
    this.users += 1;
    if (this.users === 1) { this.edge.start(); this.evdev.start(); }
  }

  rescan(): void {
    if (this.rescanTimer !== null) { clearTimeout(this.rescanTimer); this.rescanTimer = null; }
    this.edge.start();
    this.evdev.start();
  }

  stop(): void {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0) {
      if (this.rescanTimer !== null) { clearTimeout(this.rescanTimer); this.rescanTimer = null; }
      this.evdev.stop(); this.edge.stop();
    }
  }
}
