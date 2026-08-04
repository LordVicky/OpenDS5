/**
 * Reads the physical DualSense's own firmware info (HID feature report 0x20).
 *
 * This is distinct from the bridge firmware version reported by the companion
 * device info report: that one describes the emulated DS5 Bridge dongle and
 * gates companion features, while this one describes the controller in the
 * user's hands.
 *
 * Byte offsets follow the kernel's dualsense_get_firmware_info() in
 * drivers/hid/hid-playstation.c.
 */

import type { ControllerFirmwareInfo } from '../shared/types';
import { classifyControllerDevice } from './controller-device';

export type { ControllerFirmwareInfo };

export const FIRMWARE_INFO_REPORT_ID = 0x20;
export const FIRMWARE_INFO_REPORT_SIZE = 64;

const BUILD_DATE_RANGE = [1, 12] as const;
const BUILD_TIME_RANGE = [12, 20] as const;
const HARDWARE_VERSION_OFFSET = 24;
/** What the kernel exposes as sysfs `firmware_version` and dualsensectl prints. */
const INTERNAL_FIRMWARE_VERSION_OFFSET = 28;
/**
 * The kernel calls this "update version" and treats it as a feature-capability
 * version. It is nevertheless the number Sony publishes as the controller's
 * firmware version - Sony's own updater-tool list pairs firmware 0x0630 with
 * DualSense "Type 0004", matching both this field and sw_series on a physical
 * controller - so it is the one a user can cross-reference against an official
 * release. The value at offset 28 is reported separately as
 * `internalFirmwareVersion` rather than dropped, since Linux tooling shows it.
 */
const FIRMWARE_VERSION_OFFSET = 44;

function readU16(report: ArrayLike<number>, offset: number): number {
  return (report[offset] | (report[offset + 1] << 8)) >>> 0;
}

function readU32(report: ArrayLike<number>, offset: number): number {
  return (
    (report[offset] |
      (report[offset + 1] << 8) |
      (report[offset + 2] << 16) |
      (report[offset + 3] << 24)) >>>
    0
  );
}

function readAscii(report: ArrayLike<number>, start: number, end: number): string {
  let text = '';
  for (let index = start; index < end; index += 1) {
    const code = report[index];
    if (code === 0) {
      break;
    }
    text += String.fromCharCode(code);
  }
  return text;
}

/** Standard DualSense and DualSense Edge product ids. */
export { DUALSENSE_PRODUCT_IDS, SONY_VENDOR_ID } from './controller-device';

export interface HidDeviceLike {
  getFeatureReport(reportId: number, length: number): number[];
  close(): void;
}

export interface HidOpener {
  open(path: string): HidDeviceLike;
}

/** Structurally compatible with HidDeviceSummary, whose fields are all optional. */
export interface HidDeviceIdentity {
  vendorId?: number;
  productId?: number;
  path?: string;
}

export interface HidAccess extends HidOpener {
  devices(): HidDeviceIdentity[];
}

export function parseControllerFirmwareReport(
  report: ArrayLike<number> | null | undefined
): ControllerFirmwareInfo | null {
  if (!report || report.length < FIRMWARE_INFO_REPORT_SIZE) {
    return null;
  }
  if (report[0] !== FIRMWARE_INFO_REPORT_ID) {
    return null;
  }

  return {
    firmwareVersion: `0x${readU16(report, FIRMWARE_VERSION_OFFSET).toString(16).padStart(4, '0')}`,
    internalFirmwareVersion: `0x${readU32(report, INTERNAL_FIRMWARE_VERSION_OFFSET)
      .toString(16)
      .padStart(8, '0')}`,
    hardwareVersion: `0x${readU32(report, HARDWARE_VERSION_OFFSET).toString(16).padStart(8, '0')}`,
    buildDate: readAscii(report, ...BUILD_DATE_RANGE),
    buildTime: readAscii(report, ...BUILD_TIME_RANGE)
  };
}

/**
 * Reads firmware info straight from the physical controller.
 *
 * Takes an already-enumerated device list rather than enumerating itself:
 * HID enumeration is the slow part and the app deliberately runs it in the
 * discovery worker, so this only opens one known hidraw node and issues a
 * single feature-report get.
 *
 * Safe to call while vdsd owns the controller: a feature-report get is a
 * read-only control transfer that does not disturb the input stream. Firmware
 * cannot change while the controller stays connected, so callers should read
 * this once per connection and cache it rather than polling.
 *
 * Returns null whenever the controller is absent or unreadable (a hidraw node
 * the user lacks permission for is the common case), so the caller can simply
 * omit the field rather than surface an error.
 */
export function readControllerFirmware(
  hid: HidOpener,
  devices: readonly HidDeviceIdentity[]
): ControllerFirmwareInfo | null {
  const candidate = devices.find(
    (device) =>
      classifyControllerDevice(device).isDualSense &&
      Boolean(device.path)
  );

  if (!candidate?.path) {
    return null;
  }

  let device: HidDeviceLike;
  try {
    device = hid.open(candidate.path);
  } catch {
    return null;
  }

  try {
    return parseControllerFirmwareReport(
      device.getFeatureReport(FIRMWARE_INFO_REPORT_ID, FIRMWARE_INFO_REPORT_SIZE)
    );
  } catch {
    return null;
  } finally {
    try {
      device.close();
    } catch {
      /* closing a device that already went away is not an error worth raising */
    }
  }
}

/**
 * Holds the controller's firmware info for the life of one connection.
 *
 * Firmware cannot change while a controller stays connected, so this reads at
 * most once per connection - including when the read fails, so a controller we
 * cannot open does not get probed on every status poll. Disconnecting clears
 * the cache so a different controller is read afresh.
 */
export class ControllerFirmwareCache {
  private attempted = false;
  private cached: ControllerFirmwareInfo | null = null;

  constructor(
    private readonly read: (devices: readonly HidDeviceIdentity[]) => ControllerFirmwareInfo | null
  ) {}

  get(connected: boolean, devices: readonly HidDeviceIdentity[]): ControllerFirmwareInfo | null {
    if (!connected) {
      this.reset();
      return null;
    }
    if (!this.attempted) {
      this.attempted = true;
      this.cached = this.read(devices);
    }
    return this.cached;
  }

  /** Forgets the cached value so the next connection reads the controller again. */
  reset(): void {
    this.attempted = false;
    this.cached = null;
  }
}

/**
 * HID access backed by node-hid. Loaded lazily so unit tests never pull in the
 * native module.
 */
export function createNodeHidAccess(): HidAccess {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const HID = require('node-hid') as typeof import('node-hid');
  return {
    devices: () => HID.devices(),
    open: (path: string) => new HID.HID(path)
  };
}
