import { EventEmitter } from 'node:events';
import type { AdaptiveTriggerPreviewEffect } from '../shared/protocol';
import { ModifierEvaluator, type ControllerInputState } from '../shared/trigger-modifier-eval';
import { type EngineStatus, type TriggerEffectSpec, type TriggerProfile } from '../shared/trigger-profiles';
import type { ActiveProfileChange, GameWatcher } from './game-watcher';
import type { EvdevInputReader } from './evdev-input-reader';
import type { TriggerProfileStore } from './trigger-profile-store';

export type { EngineStatus };

export interface TriggerEffectSink {
  applyAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<unknown>;
  resetAdaptiveTriggers(): Promise<unknown>;
}

type EngineOptions = {
  sink: TriggerEffectSink;
  store: TriggerProfileStore;
  watcher: GameWatcher;
  reader: EvdevInputReader;
};

type TriggerName = 'l2' | 'r2';

function effectEquals(a: TriggerEffectSpec | null, b: TriggerEffectSpec | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.mode === b.mode &&
    a.startPercent === b.startPercent &&
    a.wallPercent === b.wallPercent &&
    a.forcePercent === b.forcePercent
  );
}

export class TriggerProfileEngine extends EventEmitter {
  private readonly sink: TriggerEffectSink;
  private readonly store: TriggerProfileStore;
  private readonly watcher: GameWatcher;
  private readonly reader: EvdevInputReader;
  private readonly evaluator = new ModifierEvaluator();
  private enabled = false;
  private suspended = false;
  private activeProfile: TriggerProfile | null = null;
  private lastApplied: Record<TriggerName, TriggerEffectSpec | null> = { l2: null, r2: null };
  private writeChain: Promise<void> = Promise.resolve();
  private latestDesired: { l2: TriggerEffectSpec | null; r2: TriggerEffectSpec | null } | null = null;
  private writeScheduled = false;

  constructor(options: EngineOptions) {
    super();
    this.sink = options.sink;
    this.store = options.store;
    this.watcher = options.watcher;
    this.reader = options.reader;
    this.watcher.on('change', (change: ActiveProfileChange) => {
      void this.onActiveProfileChange(change);
    });
    this.reader.on('input', (state: ControllerInputState) => this.onInput(state));
    this.reader.on('error', () => {
      // No evdev access: static bases still work; modifiers are inert.
    });
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.watcher.start();
      this.reader.start();
      await this.onActiveProfileChange(this.watcher.getActive());
    } else {
      this.watcher.stop();
      this.reader.stop();
      this.activeProfile = null;
      this.evaluator.setProfile(null);
      await this.enqueue(() => this.resetIfNeeded(true));
    }
    this.emitStatus();
  }

  async suspend(): Promise<void> {
    if (this.suspended) return;
    this.suspended = true;
    await this.enqueue(() => this.resetIfNeeded(true));
    this.emitStatus();
  }

  async resume(): Promise<void> {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.enabled) {
      await this.enqueue(() => this.applyBasesJob());
    }
    this.emitStatus();
  }

  pinProfile(profileId: string | null): void {
    this.watcher.pinProfile(profileId);
  }

  refreshProfiles(): void {
    const profiles = this.store.list();
    this.watcher.setProfiles(profiles);
    const active = this.watcher.getActive();
    if (this.enabled && this.activeProfile) {
      void this.onActiveProfileChange(active);
    }
  }

  getStatus(): EngineStatus {
    const active = this.watcher.getActive();
    return {
      enabled: this.enabled,
      suspended: this.suspended,
      activeProfileId: active.profileId,
      matchedBy: active.matchedBy,
      matchedName: active.matchedName
    };
  }

  private async onActiveProfileChange(change: ActiveProfileChange): Promise<void> {
    if (!this.enabled) return;
    this.activeProfile = this.store.get(change.profileId);
    this.evaluator.setProfile(this.activeProfile);
    if (!this.suspended) {
      await this.enqueue(() => this.applyBasesJob());
    }
    this.emitStatus();
  }

  /**
   * Appends a sink-touching job to the single write chain so
   * applyAdaptiveTriggerEffect/resetAdaptiveTriggers calls never interleave.
   * The chain itself must survive a rejecting job so later work still runs;
   * the returned promise still resolves/rejects with that job's own outcome.
   */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.writeChain.then(fn);
    this.writeChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async applyBasesJob(): Promise<void> {
    if (!this.enabled || this.suspended) return;
    const profile = this.activeProfile;
    const l2 = profile?.triggers.l2.base ?? null;
    const r2 = profile?.triggers.r2.base ?? null;
    await this.writeDesired({ l2, r2 });
  }

  private onInput(state: ControllerInputState): void {
    if (!this.enabled || this.suspended || !this.activeProfile) return;
    const hasModifiers =
      this.activeProfile.triggers.l2.modifiers.length > 0 ||
      this.activeProfile.triggers.r2.modifiers.length > 0;
    if (!hasModifiers) return;
    const resolved = this.evaluator.update(state);
    this.latestDesired = resolved;
    if (this.writeScheduled) return;
    this.writeScheduled = true;
    void this.enqueue(async () => {
      this.writeScheduled = false;
      const desired = this.latestDesired;
      this.latestDesired = null;
      if (desired && this.enabled && !this.suspended) {
        await this.writeDesired(desired);
      }
    });
  }

  private async writeDesired(desired: { l2: TriggerEffectSpec | null; r2: TriggerEffectSpec | null }): Promise<void> {
    if (desired.l2 === null && desired.r2 === null) {
      await this.resetIfNeeded(false);
      return;
    }
    for (const trigger of ['l2', 'r2'] as const) {
      const effect = desired[trigger];
      if (effectEquals(effect, this.lastApplied[trigger])) continue;
      if (effect === null) {
        // One trigger dropped to no-effect while the other still has one:
        // re-send a zero-force feedback effect to relax it.
        await this.sink.applyAdaptiveTriggerEffect({
          mode: 'feedback',
          target: trigger,
          startPercent: 0,
          wallPercent: 0,
          forcePercent: 0
        });
      } else {
        await this.sink.applyAdaptiveTriggerEffect({ ...effect, target: trigger });
      }
      this.lastApplied[trigger] = effect;
    }
  }

  private async resetIfNeeded(force: boolean): Promise<void> {
    const hadEffects = this.lastApplied.l2 !== null || this.lastApplied.r2 !== null;
    if (hadEffects || force) {
      await this.sink.resetAdaptiveTriggers();
    }
    this.lastApplied = { l2: null, r2: null };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}
