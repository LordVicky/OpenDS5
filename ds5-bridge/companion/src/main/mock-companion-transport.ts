import { EventEmitter } from 'node:events';
import type { CompanionTransport, CompanionTransportOpenOptions } from './companion-transport';
import {
  ACK_RESULT,
  MAGIC,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  REPORT_ID,
  REPORT_LENGTH
} from '../shared/protocol';

/**
 * In-memory companion transport used for UI automation (layout-check /
 * visual-smoke) so the app renders as if a firmware-current DualSense is
 * connected without any real hardware. Gated behind DS5_BRIDGE_MOCK_CONTROLLER.
 */
export class MockCompanionTransport extends EventEmitter implements CompanionTransport {
  readonly path = 'mock://ds5-bridge';
  private settingsRevision = 1;
  private lastCommandId = 0;
  private lastCommandSequence = 0;

  static open(_options: CompanionTransportOpenOptions = {}): Promise<CompanionTransport> {
    return Promise.resolve(new MockCompanionTransport());
  }

  getFeatureReport(reportId: number, _length: number = REPORT_LENGTH): Promise<number[]> {
    if (reportId === REPORT_ID.STATUS) {
      return Promise.resolve(this.statusReport());
    }
    if (reportId === REPORT_ID.ACK) {
      return Promise.resolve(this.ackReport());
    }
    return Promise.resolve(headerReport(reportId));
  }

  sendFeatureReport(report: ArrayLike<number>): Promise<void> {
    this.lastCommandId = report[7] ?? 0;
    this.lastCommandSequence = report[8] ?? 0;
    this.settingsRevision = (this.settingsRevision + 1) & 0xffff;
    return Promise.resolve();
  }

  write(report: ArrayLike<number>): Promise<void> {
    return this.sendFeatureReport(report);
  }

  close(): void {
    // no-op
  }

  private statusReport(): number[] {
    const report = headerReport(REPORT_ID.STATUS);
    report[7] = 1; // controllerConnected
    report[8] = 1; // controllerType: dualsense
    report[9] = 80; // batteryPercent
    report[12] = 1; // hapticsReady
    writeU16(report, 13, 100); // hapticsGainPercent
    report[15] = 1; // ledEnabled
    writeU16(report, 17, this.settingsRevision);
    report[19] = ACK_RESULT.OK;
    report[25] = 1; // firmware major
    report[26] = 6; // firmware minor
    report[27] = 3; // firmware patch -> 1.6.3 (>= MIN_SUPPORTED_FIRMWARE_VERSION)
    report[28] = 0xff; // firmwareFlags: advertise every supported capability
    writeU16(report, 29, 30); // speakerVolumePercent
    report[49] = 0x01; // DualSense is the only supported host persona
    report[57] = 4; // speakerGainLevel
    return report;
  }

  private ackReport(): number[] {
    const report = headerReport(REPORT_ID.ACK);
    report[7] = this.lastCommandId;
    report[8] = this.lastCommandSequence;
    report[9] = ACK_RESULT.OK;
    writeU16(report, 11, this.settingsRevision);
    return report;
  }
}

function headerReport(reportId: number): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = reportId;
  report[1] = MAGIC.charCodeAt(0);
  report[2] = MAGIC.charCodeAt(1);
  report[3] = MAGIC.charCodeAt(2);
  report[4] = MAGIC.charCodeAt(3);
  report[5] = PROTOCOL_MAJOR;
  report[6] = PROTOCOL_MINOR;
  return report;
}

function writeU16(report: number[], offset: number, value: number): void {
  report[offset] = value & 0xff;
  report[offset + 1] = (value >> 8) & 0xff;
}
