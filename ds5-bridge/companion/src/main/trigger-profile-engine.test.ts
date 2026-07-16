import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TriggerProfileEngine } from './trigger-profile-engine';
import { TriggerProfileStore } from './trigger-profile-store';
import { GameWatcher } from './game-watcher';
import type { AdaptiveTriggerEffectV2Targeted, AdaptiveTriggerPreviewEffect } from '../shared/protocol';
import type { ControllerInputState } from '../shared/trigger-modifier-eval';
import type { TriggerProfile } from '../shared/trigger-profiles';

class FakeSink {
  applied: AdaptiveTriggerPreviewEffect[] = [];
  appliedV2: AdaptiveTriggerEffectV2Targeted[] = [];
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
  async applyAdaptiveTriggerEffectV2(effect: AdaptiveTriggerEffectV2Targeted): Promise<void> {
    this.callOrder.push('apply-v2');
    this.appliedV2.push(effect);
    this.callOrder.push('apply-v2-done');
  }
  async resetAdaptiveTriggers(): Promise<void> {
    this.callOrder.push('reset');
    this.resets += 1;
  }
}

class FakeReader extends EventEmitter {
  startCount = 0;
  start(): void {
    this.startCount += 1;
  }
  stop(): void {}
  feed(state: Partial<ControllerInputState>): void {
    this.emit('input', { timestampMs: 0, l2: 0, r2: 0, buttons: new Set(), ...state });
  }
  fail(error = new Error('no device')): void {
    this.emit('error', error);
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

  it('routes a multi-feedback base through the V2 sink and dedupes identical writes', async () => {
    const store = new TriggerProfileStore(dir);
    const zones = [0, 0, 0, 0, 60, 60, 60, 60, 0, 0];
    store.save({
      version: 1,
      id: 'multi',
      name: 'Multi',
      match: { processNames: [], windowTitles: [] },
      triggers: {
        l2: { base: null, modifiers: [] },
        r2: { base: { mode: 'multi-feedback', zones: [...zones] }, modifiers: [] }
      },
      updatedAtMs: 0
    });
    engine.refreshProfiles();
    watcher.pinProfile('multi');
    await flush();
    expect(sink.applied).toHaveLength(0);
    expect(sink.appliedV2).toHaveLength(1);
    expect(sink.appliedV2[0]).toMatchObject({ mode: 'multi-feedback', target: 'r2', zones });
    // Re-applying the same profile must not emit a duplicate V2 write.
    watcher.pinProfile(null);
    watcher.pinProfile('multi');
    await flush();
    const multiWrites = sink.appliedV2.filter((effect) => effect.mode === 'multi-feedback');
    expect(multiWrites).toHaveLength(1);
  });

  it('keeps a plain feedback base on the V1 sink call', async () => {
    const store = new TriggerProfileStore(dir);
    store.save({
      version: 1,
      id: 'ffb',
      name: 'FFB',
      match: { processNames: [], windowTitles: [] },
      triggers: {
        l2: { base: null, modifiers: [] },
        r2: { base: { mode: 'feedback', startPercent: 20, forcePercent: 80 }, modifiers: [] }
      },
      updatedAtMs: 0
    });
    engine.refreshProfiles();
    watcher.pinProfile('ffb');
    await flush();
    expect(sink.appliedV2).toHaveLength(0);
    expect(sink.applied).toHaveLength(1);
    expect(sink.applied[0]).toMatchObject({ mode: 'feedback', target: 'r2', startPercent: 20, forcePercent: 80 });
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

  it('retries reader.start() ~5s after a reader error while enabled, and delivers input once it recovers', async () => {
    watcher.pinProfile('shooter');
    await flush();
    const startsBefore = reader.startCount;

    vi.useFakeTimers();
    try {
      reader.fail();
      // Enabling/status must not break from a reader error.
      expect(engine.getStatus().enabled).toBe(true);
      expect(reader.startCount).toBe(startsBefore);

      await vi.advanceTimersByTimeAsync(5000);
      expect(reader.startCount).toBe(startsBefore + 1);
    } finally {
      vi.useRealTimers();
    }

    reader.feed({ r2: 255 });
    await flush();
    const vibration = sink.applied.filter((effect) => effect.mode === 'vibration');
    expect(vibration.length).toBeGreaterThanOrEqual(1);
  });

  it('clears the pending retry timer when disabled', async () => {
    watcher.pinProfile('shooter');
    await flush();
    const startsBefore = reader.startCount;

    vi.useFakeTimers();
    try {
      reader.fail();
      await engine.setEnabled(false);
      await vi.advanceTimersByTimeAsync(10000);
      expect(reader.startCount).toBe(startsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('setDraftPreview', () => {
    const draftTriggers = {
      l2: {
        base: { mode: 'feedback' as const, startPercent: 5, forcePercent: 30 },
        modifiers: [{
          when: { source: 'input' as const, condition: 'trigger-full-pull' },
          effect: { mode: 'vibration' as const, startPercent: 0, forcePercent: 75 }
        }]
      },
      r2: null
    };

    it('applies draft base effects immediately, overriding the active profile', async () => {
      watcher.pinProfile('shooter');
      await flush();
      await engine.setDraftPreview(draftTriggers);
      expect(sink.applied.filter((effect) => effect.target === 'l2')).toEqual([
        { mode: 'feedback', target: 'l2', startPercent: 5, wallPercent: 0, forcePercent: 30 }
      ]);
      // The active profile's r2 base is relaxed because the draft has no r2 effect.
      expect(sink.applied.at(-1)).toMatchObject({ target: 'r2', forcePercent: 0 });
    });

    it('evaluates draft modifiers live from controller input', async () => {
      watcher.pinProfile('shooter');
      await flush();
      await engine.setDraftPreview(draftTriggers);
      reader.feed({ l2: 255 });
      await flush();
      expect(sink.applied.at(-1)).toMatchObject({ mode: 'vibration', target: 'l2', forcePercent: 75 });
      // The active profile's own modifiers must not fire while previewing.
      reader.feed({ l2: 255, r2: 255 });
      await flush();
      expect(sink.applied.filter((effect) => effect.forcePercent === 60)).toHaveLength(0);
    });

    it('reverts to the active profile bases when cleared with null', async () => {
      watcher.pinProfile('shooter');
      await flush();
      await engine.setDraftPreview(draftTriggers);
      await engine.setDraftPreview(null);
      expect(sink.applied.at(-1)).toMatchObject({ mode: 'weapon', target: 'r2', forcePercent: 90 });
    });

    it('dedupes a draft identical to the last applied effects', async () => {
      watcher.pinProfile('shooter');
      await flush();
      const appliedBefore = sink.applied.length;
      await engine.setDraftPreview({
        l2: { base: null, modifiers: [] },
        r2: { base: { mode: 'weapon', startPercent: 10, wallPercent: 40, forcePercent: 90 }, modifiers: [] }
      });
      expect(sink.applied.length).toBe(appliedBefore);
    });

    it('is a no-op while the engine is disabled', async () => {
      await engine.setEnabled(false);
      const resetsBefore = sink.resets;
      const appliedBefore = sink.applied.length;
      await engine.setDraftPreview(draftTriggers);
      expect(sink.applied.length).toBe(appliedBefore);
      expect(sink.resets).toBe(resetsBefore);
    });

    it('is a no-op while the engine is suspended, and suspend drops an active preview', async () => {
      watcher.pinProfile('shooter');
      await flush();
      await engine.setDraftPreview(draftTriggers);
      await engine.suspend();
      const appliedBefore = sink.applied.length;
      await engine.setDraftPreview(draftTriggers);
      expect(sink.applied.length).toBe(appliedBefore);
      await engine.resume();
      // Resume applies the active profile's bases, not the stale draft.
      expect(sink.applied.at(-1)).toMatchObject({ mode: 'weapon', target: 'r2', forcePercent: 90 });
    });

    it('keeps the preview across an active profile change and applies the new profile once cleared', async () => {
      const store = new TriggerProfileStore(dir);
      store.save({
        ...profile,
        id: 'racer',
        name: 'Racer',
        triggers: {
          l2: { base: null, modifiers: [] },
          r2: { base: { mode: 'feedback', startPercent: 50, wallPercent: 50, forcePercent: 50 }, modifiers: [] }
        }
      });
      engine.refreshProfiles();
      watcher.pinProfile('shooter');
      await flush();
      await engine.setDraftPreview(draftTriggers);
      watcher.pinProfile('racer');
      await flush();
      // The profile change must not clobber the preview: racer's base never reaches the sink.
      expect(sink.applied.some((effect) => effect.forcePercent === 50)).toBe(false);
      await engine.setDraftPreview(null);
      // Clearing applies the latest active profile's bases (racer), not shooter's.
      expect(sink.applied.at(-1)).toMatchObject({ mode: 'feedback', target: 'r2', forcePercent: 50 });
    });

    it('serializes preview writes against an in-flight input write', async () => {
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

      const previewPromise = engine.setDraftPreview(draftTriggers);
      await flush();
      // The preview write must wait for the in-flight apply to finish.
      expect(sink.callOrder).toEqual(['apply']);

      sink.applyGate = null;
      releaseApply();
      await previewPromise;
      expect(sink.callOrder.slice(0, 3)).toEqual(['apply', 'apply-done', 'apply']);
      expect(sink.applied.some((effect) => effect.target === 'l2' && effect.forcePercent === 30)).toBe(true);
    });
  });

  describe('multi-state profiles', () => {
    const statefulProfile: TriggerProfile = {
      version: 1,
      id: 'stateful',
      name: 'Stateful',
      match: { processNames: [], windowTitles: [] },
      triggers: {
        l2: { base: null, modifiers: [] },
        r2: { base: { mode: 'feedback', startPercent: 20, forcePercent: 30 }, modifiers: [] }
      },
      states: [
        {
          name: 'Pistol',
          triggers: {
            l2: { base: null, modifiers: [] },
            r2: { base: { mode: 'feedback', startPercent: 20, forcePercent: 30 }, modifiers: [] }
          }
        },
        {
          name: 'Shotgun',
          triggers: {
            l2: { base: null, modifiers: [] },
            r2: {
              base: { mode: 'weapon', startPercent: 30, wallPercent: 70, forcePercent: 100 },
              modifiers: [{
                when: { source: 'input', condition: 'trigger-full-pull' },
                effect: { mode: 'vibration', startPercent: 0, forcePercent: 60 }
              }]
            }
          }
        }
      ],
      switching: {
        rules: [
          { button: 'triangle', action: 'cycle' },
          { button: 'dpad-left', action: 'select', state: 'Pistol' }
        ],
        menuButtons: ['options']
      },
      updatedAtMs: 0
    };

    beforeEach(async () => {
      const store = new TriggerProfileStore(dir);
      store.save(statefulProfile);
      engine.refreshProfiles();
      watcher.pinProfile('stateful');
      await flush();
    });

    it('applies the default state bases on activation and reports the state name', () => {
      expect(sink.applied).toHaveLength(1);
      expect(sink.applied[0]).toMatchObject({ mode: 'feedback', target: 'r2', forcePercent: 30 });
      expect(engine.getStatus().activeStateName).toBe('Pistol');
    });

    it('re-applies bases exactly once when a switch rule fires', async () => {
      reader.feed({ buttons: new Set(['triangle']) });
      await flush();
      expect(engine.getStatus().activeStateName).toBe('Shotgun');
      const weaponWrites = sink.applied.filter((effect) => effect.mode === 'weapon');
      expect(weaponWrites).toHaveLength(1);
      expect(weaponWrites[0]).toMatchObject({ target: 'r2', wallPercent: 70, forcePercent: 100 });
      // Held button must not fire again.
      reader.feed({ buttons: new Set(['triangle']) });
      await flush();
      expect(engine.getStatus().activeStateName).toBe('Shotgun');
    });

    it('evaluates modifiers against the active state slots', async () => {
      reader.feed({ buttons: new Set(['triangle']) });
      await flush();
      reader.feed({ buttons: new Set(), r2: 255 });
      await flush();
      expect(sink.applied.at(-1)).toMatchObject({ mode: 'vibration', target: 'r2', forcePercent: 60 });
    });

    it('ignores switch rules while the menu guard is up', async () => {
      reader.feed({ buttons: new Set(['options']) });
      reader.feed({ buttons: new Set() });
      reader.feed({ buttons: new Set(['triangle']) });
      await flush();
      expect(engine.getStatus().activeStateName).toBe('Pistol');
    });

    it('selectState switches manually and ignores unknown names', async () => {
      const status = await engine.selectState('Shotgun');
      expect(status.activeStateName).toBe('Shotgun');
      expect(sink.applied.filter((effect) => effect.mode === 'weapon')).toHaveLength(1);
      const unchanged = await engine.selectState('Nope');
      expect(unchanged.activeStateName).toBe('Shotgun');
    });

    it('emits a status event carrying the new state name on switch', async () => {
      const statuses: Array<{ activeStateName: string | null }> = [];
      engine.on('status', (status) => statuses.push(status));
      reader.feed({ buttons: new Set(['triangle']) });
      await flush();
      expect(statuses.some((status) => status.activeStateName === 'Shotgun')).toBe(true);
    });

    it('reports a null state name for states-less profiles', async () => {
      watcher.pinProfile('shooter');
      await flush();
      expect(engine.getStatus().activeStateName).toBeNull();
    });

    it('resets to the default state when the profile re-activates', async () => {
      reader.feed({ buttons: new Set(['triangle']) });
      await flush();
      expect(engine.getStatus().activeStateName).toBe('Shotgun');
      watcher.pinProfile('shooter');
      await flush();
      watcher.pinProfile('stateful');
      await flush();
      expect(engine.getStatus().activeStateName).toBe('Pistol');
    });
  });
});
