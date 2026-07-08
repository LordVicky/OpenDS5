import { describe, expect, it } from 'vitest';
import {
  ACK_RESULT,
  COMMAND_ID,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  buildCommandReport,
  parseAckReport,
  parseStatusReport,
  REPORT_ID,
  REPORT_LENGTH
} from '../shared/protocol';
import { MockCompanionTransport } from './mock-companion-transport';

describe('MockCompanionTransport', () => {
  it('reports a connected DualSense that supports audio reactive haptics', async () => {
    const transport = new MockCompanionTransport();
    const raw = await transport.getFeatureReport(REPORT_ID.STATUS, REPORT_LENGTH);
    const status = parseStatusReport(raw);

    expect(status.controllerConnected).toBe(true);
    expect(status.controllerType).toBe('dualsense');
    expect(status.firmwareFlags.audioReactiveHapticsControl).toBe(true);
    expect(status.protocolVersion).toBe(`${PROTOCOL_MAJOR}.${PROTOCOL_MINOR}`);
  });

  it('acknowledges commands with OK, echoing the command id and advancing the settings revision', async () => {
    const transport = new MockCompanionTransport();
    const before = parseStatusReport(await transport.getFeatureReport(REPORT_ID.STATUS, REPORT_LENGTH));

    await transport.sendFeatureReport(buildCommandReport(COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS, 42, 1));
    const ack = parseAckReport(await transport.getFeatureReport(REPORT_ID.ACK, REPORT_LENGTH));

    expect(ack.commandId).toBe(COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS);
    expect(ack.commandSequence).toBe(42);
    expect(ack.resultCode).toBe(ACK_RESULT.OK);
    expect(ack.settingsRevision).not.toBe(before.settingsRevision);
  });
});
