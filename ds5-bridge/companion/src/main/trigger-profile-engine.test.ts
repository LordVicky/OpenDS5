import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriggerProfileEngine } from './trigger-profile-engine';
import { TriggerProfileStore } from './trigger-profile-store';
import { GameWatcher } from './game-watcher';
import type { AdaptiveTriggerPreviewEffect } from '../shared/protocol';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';
import type { TriggerProfile } from '../shared/trigger-profiles';

class FakeSink {
  applied: AdaptiveTriggerPreviewEffect[] = [];
  resets = 0;
  callOrder: string[] = [];
  applyGate: Promise<void> | null = null;
  async applyAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<void> {
    this.callOrder.push('apply');
    this.applied.push(effect);
    if (this.applyGate) {
      await this.applyGate;
    }
    this.callOrder.push('apply-done');
  }
  async resetAdaptiveTriggers(): Promise<void> {
    this.callOrder.push('reset');
    this.resets += 1;
  }
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

let dir: string;
let sink: FakeSink;
let reader: FakeReader;
let watcher: GameWatcher;
let engine: TriggerProfileEngine;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'trigger-engine-'));
  const store = new TriggerProfileStore(dir);
  store.save(profile);
  sink = new FakeSink();
  reader = new FakeReader();
  watcher = new GameWatcher({ listProcesses: () => [], pollIntervalMs: 100000, debounceMs: 0 });
  engine = new TriggerProfileEngine({
    sink,
    store,
    watcher,
    reader: reader as never
  });
  engine.refreshProfiles();
  await engine.setEnabled(true);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TriggerProfileEngine', () => {
  it('applies base effects when a profile activates', async () => {
    watcher.pinProfile('shooter');
    await flush();
    expect(sink.applied).toHaveLength(1);
    expect(sink.applied[0]).toMatchObject({ mode: 'weapon', target: 'r2', forcePercent: 90 });
  });

  it('applies modifier effect on matching input and dedupes repeats', async () => {
    watcher.pinProfile('shooter');
    await flush();
    reader.feed({ r2: 255 });
    await flush();
    reader.feed({ r2: 255 });
    await flush();
    const vibration = sink.applied.filter((effect) => effect.mode === 'vibration');
    expect(vibration).toHaveLength(1);
    reader.feed({ r2: 0 });
    await flush();
    expect(sink.applied.at(-1)).toMatchObject({ mode: 'weapon', target: 'r2' });
  });

  it('resets triggers when the profile deactivates to an effectless default', async () => {
    watcher.pinProfile('shooter');
    await flush();
    watcher.pinProfile(null);
    await flush();
    expect(sink.resets).toBeGreaterThanOrEqual(1);
    expect(engine.getStatus().activeProfileId).toBe('default');
  });

  it('suspend resets and resume re-applies', async () => {
    watcher.pinProfile('shooter');
    await flush();
    const appliedBefore = sink.applied.length;
    await engine.suspend();
    expect(sink.resets).toBe(1);
    reader.feed({ r2: 255 });
    await flush();
    expect(sink.applied).toHaveLength(appliedBefore);
    await engine.resume();
    expect(sink.applied.length).toBeGreaterThan(appliedBefore);
  });

  it('serializes an in-flight input write against a concurrent suspend', async () => {
    watcher.pinProfile('shooter');
    await flush();
    sink.callOrder = [];

    let releaseApply: () => void = () => {};
    sink.applyGate = new Promise((resolve) => {
      releaseApply = resolve;
    });

    reader.feed({ r2: 255 });
    await flush();
    expect(sink.callOrder).toEqual(['apply']);

    const suspendPromise = engine.suspend();
    await flush();
    // The suspend's reset must wait for the in-flight apply to finish.
    expect(sink.callOrder).toEqual(['apply']);

    releaseApply();
    await suspendPromise;

    expect(sink.callOrder).toEqual(['apply', 'apply-done', 'reset']);
    expect(engine.getStatus().suspended).toBe(true);

    sink.applyGate = null;
    const appliedBefore = sink.applied.length;
    await engine.resume();
    expect(sink.applied.length).toBeGreaterThan(appliedBefore);
  });

  it('disabling the engine resets and ignores everything', async () => {
    watcher.pinProfile('shooter');
    await flush();
    await engine.setEnabled(false);
    expect(sink.resets).toBe(1);
    reader.feed({ r2: 255 });
    await flush();
    expect(sink.applied.filter((effect) => effect.mode === 'vibration')).toHaveLength(0);
  });
});
