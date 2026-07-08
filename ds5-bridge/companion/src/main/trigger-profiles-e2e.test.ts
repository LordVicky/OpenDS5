// Setup: construct BridgeService over MockCompanionTransport the same way
// bridge-service.test.ts does (its `createService` factory helper builds a
// BridgeService against a SettingsStore in a temp dir). Rather than mocking
// node-hid, this test relies on DS5_BRIDGE_MOCK_CONTROLLER=1, which makes
// `openCompanionTransport` (see companion-transport.ts) hand back a
// MockCompanionTransport directly -- the exact in-memory transport
// bridge-service.test.ts stands in for real hardware.
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeService } from './bridge-service';
import { SettingsStore } from './settings-store';
import { MockCompanionTransport } from './mock-companion-transport';
import { TriggerProfileEngine } from './trigger-profile-engine';
import { TriggerProfileStore } from './trigger-profile-store';
import { GameWatcher } from './game-watcher';
import { COMMAND_ID, REPORT_ID } from '../shared/protocol';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';
import type { TriggerProfile } from '../shared/trigger-profiles';

// Mirrors the private triggerTestModeValue/triggerTestTargetValue mappings in
// bridge-service.ts (not exported, so the wire encoding is reproduced here to
// decode the raw command reports captured off the mock transport).
function triggerTestModeValue(mode: 'off' | 'weapon' | 'vibration'): number {
  if (mode === 'weapon') return 1;
  if (mode === 'vibration') return 2;
  return 0;
}

function triggerTestTargetValue(target: 'l2' | 'r2'): number {
  if (target === 'l2') return 1;
  if (target === 'r2') return 2;
  return 0;
}

type DecodedCommand = {
  commandId: number;
  value: number;
  extraPayload: number[];
};

function decodeCommandReport(report: ArrayLike<number>): DecodedCommand {
  return {
    commandId: report[7] ?? 0,
    value: (report[9] ?? 0) | ((report[10] ?? 0) << 8),
    extraPayload: [report[11] ?? 0, report[12] ?? 0, report[13] ?? 0]
  };
}

class FakeReader extends EventEmitter {
  start(): void {}
  stop(): void {}
  feed(state: Partial<ControllerInputState>): void {
    this.emit('input', { timestampMs: 0, l2: 0, r2: 0, buttons: new Set(), ...state });
  }
}

const profile: TriggerProfile = {
  version: 1,
  id: 'shooter',
  name: 'Shooter',
  match: { processNames: ['game.exe'], windowTitles: [] },
  triggers: {
    l2: { base: null, modifiers: [] },
    r2: {
      base: { mode: 'weapon', startPercent: 10, wallPercent: 40, forcePercent: 90 },
      modifiers: [{
        when: { source: 'input', condition: 'trigger-full-pull' },
        effect: { mode: 'vibration', startPercent: 0, wallPercent: 0, forcePercent: 60 }
      }]
    }
  },
  updatedAtMs: 0
};

function createService(): { service: BridgeService; tempDir: string } {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ds5-bridge-companion-'));
  const settingsStore = new SettingsStore(tempDir);
  return {
    service: new BridgeService(settingsStore),
    tempDir
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('trigger profiles end-to-end', () => {
  let bridgeTempDir: string;
  let profileDir: string;
  let service: BridgeService;
  let sendSpy: ReturnType<typeof vi.spyOn>;
  let reader: FakeReader;
  let watcher: GameWatcher;
  let engine: TriggerProfileEngine;
  let processes: string[];

  beforeEach(() => {
    process.env.DS5_BRIDGE_MOCK_CONTROLLER = '1';

    const fixture = createService();
    service = fixture.service;
    bridgeTempDir = fixture.tempDir;

    sendSpy = vi.spyOn(MockCompanionTransport.prototype, 'sendFeatureReport');

    profileDir = mkdtempSync(path.join(tmpdir(), 'trigger-profiles-e2e-'));
    const store = new TriggerProfileStore(profileDir);
    store.save(profile);

    processes = [];
    reader = new FakeReader();
    watcher = new GameWatcher({ listProcesses: () => processes, pollIntervalMs: 5, debounceMs: 0 });
    engine = new TriggerProfileEngine({
      sink: service,
      store,
      watcher,
      reader: reader as never
    });
    engine.refreshProfiles();
  });

  afterEach(async () => {
    await engine.setEnabled(false);
    watcher.stop();
    await service.stop();
    sendSpy.mockRestore();
    delete process.env.DS5_BRIDGE_MOCK_CONTROLLER;
    rmSync(bridgeTempDir, { recursive: true, force: true });
    rmSync(profileDir, { recursive: true, force: true });
  });

  it('activates on process match and writes the base effect through the transport', async () => {
    await engine.setEnabled(true);

    processes = ['game.exe'];
    await flush();

    expect(engine.getStatus().activeProfileId).toBe('shooter');

    const commandReports = sendSpy.mock.calls
      .map(([report]) => report as ArrayLike<number>)
      .filter((report) => report[0] === REPORT_ID.COMMAND)
      .map(decodeCommandReport);

    const applyCommands = commandReports.filter(
      (command) => command.commandId === COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT
    );
    expect(applyCommands.length).toBeGreaterThanOrEqual(1);

    const expectedValue = triggerTestModeValue('weapon') | (triggerTestTargetValue('r2') << 8);
    expect(applyCommands.at(-1)).toEqual({
      commandId: COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT,
      value: expectedValue,
      extraPayload: [10, 40, 90]
    });
  });

  it('writes the modifier effect on full pull and resets on game exit', async () => {
    await engine.setEnabled(true);

    processes = ['game.exe'];
    await flush();
    sendSpy.mockClear();

    reader.feed({ r2: 255 });
    await flush();

    const vibrationCommands = sendSpy.mock.calls
      .map(([report]) => report as ArrayLike<number>)
      .filter((report) => report[0] === REPORT_ID.COMMAND)
      .map(decodeCommandReport)
      .filter((command) => command.commandId === COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT);
    expect(vibrationCommands.length).toBeGreaterThanOrEqual(1);

    const expectedVibrationValue = triggerTestModeValue('vibration') | (triggerTestTargetValue('r2') << 8);
    expect(vibrationCommands.at(-1)).toEqual({
      commandId: COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT,
      value: expectedVibrationValue,
      extraPayload: [0, 0, 60]
    });

    sendSpy.mockClear();
    processes = [];
    await flush();
    await flush();

    const resetCommands = sendSpy.mock.calls
      .map(([report]) => report as ArrayLike<number>)
      .filter((report) => report[0] === REPORT_ID.COMMAND)
      .map(decodeCommandReport)
      .filter((command) => command.commandId === COMMAND_ID.RESET_ADAPTIVE_TRIGGERS);
    expect(resetCommands.length).toBeGreaterThanOrEqual(1);
  });
});
