import type { EventEmitter } from 'node:events';
import { WinUsbCompanionTransport } from './winusb-companion-transport';
import { VdsdCompanionTransport } from './vdsd-companion-transport';

export type CompanionTransportOpenOptions = {
  retryTimeoutMs?: number;
  retryDelayMs?: number;
};

/**
 * Shared surface of the platform companion transports: the Pico WinUSB
 * helper on Windows and the vdsd control socket on Linux.
 */
export interface CompanionTransport extends EventEmitter {
  readonly path: string;
  getFeatureReport(reportId: number, length?: number): Promise<number[]>;
  sendFeatureReport(report: ArrayLike<number>): Promise<void>;
  write(report: ArrayLike<number>): Promise<void>;
  close(): void;
}

export function openCompanionTransport(
  options: CompanionTransportOpenOptions = {}
): Promise<CompanionTransport> {
  if (process.platform === 'win32') {
    return WinUsbCompanionTransport.open(options);
  }
  return VdsdCompanionTransport.open(options);
}
