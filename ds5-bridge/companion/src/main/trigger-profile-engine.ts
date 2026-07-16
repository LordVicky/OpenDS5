import { EventEmitter } from 'node:events';
import type { AdaptiveTriggerEffectV2Targeted, AdaptiveTriggerPreviewEffect } from '../shared/protocol';
import { ModifierEvaluator, type ControllerInputState } from '../shared/trigger-modifier-eval';
import {
  effectSpecEquals,
  DEFAULT_PROFILE_ID,
  type EngineStatus,
  type TriggerEffectSpec,
  type TriggerProfile,
  type TriggerSlotConfig,
  type TriggerSlotPair
} from '../shared/trigger-profiles';
import { StateSwitcher } from '../shared/trigger-state-switcher';
import type { TriggerTestTarget } from '../shared/protocol';
import type { ActiveProfileChange, GameWatcher } from './game-watcher';
import type { EvdevInputReader } from './evdev-input-reader';
import type { TriggerProfileStore } from './trigger-profile-store';

export type { EngineStatus };

export interface DraftPreviewTriggers {
  l2: TriggerSlotConfig | null;
  r2: TriggerSlotConfig | null;
}

export interface TriggerEffectSink {
  applyAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<unknown>;
  applyAdaptiveTriggerEffectV2(effect: AdaptiveTriggerEffectV2Targeted): Promise<unknown>;
  resetAdaptiveTriggers(): Promise<unknown>;
}

type EngineOptions = {
  sink: TriggerEffectSink;
  store: TriggerProfileStore;
  watcher: GameWatcher;
  reader: EvdevInputReader;
};

type TriggerName = 'l2' | 'r2';

type ClassicV1Effect = Extract<TriggerEffectSpec, { mode: 'feedback' | 'weapon' | 'vibration' }>;

/**
 * Adapts a classic V1-compatible effect to the V1 sink payload. Only the three
 * classic arms are handled — feedback/vibration have no wall, so it is zeroed.
 * A vibration carrying a frequencyHz and every new M2 arm (off, multi-feedback,
 * slope, multi-vibration) is routed through the V2 sink call instead (see
 * writeDesired), because the V1 command cannot encode them.
 */
function toPreviewEffect(effect: ClassicV1Effect, target: TriggerTestTarget): AdaptiveTriggerPreviewEffect {
  switch (effect.mode) {
    case 'feedback':
      return { mode: 'feedback', target, startPercent: effect.startPercent, wallPercent: 0, forcePercent: effect.forcePercent };
    case 'weapon':
      return { mode: 'weapon', target, startPercent: effect.startPercent, wallPercent: effect.wallPercent, forcePercent: effect.forcePercent };
    case 'vibration':
      return { mode: 'vibration', target, startPercent: effect.startPercent, wallPercent: 0, forcePercent: effect.forcePercent };
  }
}

/**
 * Effects the V1 command can encode faithfully keep using it so old daemons keep
 * working: feedback, weapon, and vibration WITHOUT a frequencyHz. Everything else
 * (off, multi-feedback, slope, multi-vibration, and vibration WITH frequencyHz)
 * must go through the V2 command.
 */
function needsV2(effect: TriggerEffectSpec): boolean {
  switch (effect.mode) {
    case 'feedback':
    case 'weapon':
      return false;
    case 'vibration':
      return effect.frequencyHz !== undefined;
    default:
      return true;
  }
}

export class TriggerProfileEngine extends EventEmitter {
  private readonly sink: TriggerEffectSink;
  private readonly store: TriggerProfileStore;
  private readonly watcher: GameWatcher;
  private readonly reader: EvdevInputReader;
  private readonly evaluator = new ModifierEvaluator();
  private readonly draftEvaluator = new ModifierEvaluator();
  private readonly stateSwitcher = new StateSwitcher();
  private draftPreview: TriggerProfile | null = null;
  private enabled = false;
  private suspended = false;
  private activeProfile: TriggerProfile | null = null;
  private lastApplied: Record<TriggerName, TriggerEffectSpec | null> = { l2: null, r2: null };
  private writeChain: Promise<void> = Promise.resolve();
  private latestDesired: { l2: TriggerEffectSpec | null; r2: TriggerEffectSpec | null } | null = null;
  private writeScheduled = false;
  private readerRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly READER_RETRY_MS = 5000;

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
      this.scheduleReaderRetry();
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
      this.clearReaderRetry();
      this.watcher.stop();
      this.reader.stop();
      this.activeProfile = null;
      this.evaluator.setProfile(null);
      this.stateSwitcher.setProfile(null);
      this.draftPreview = null;
      this.draftEvaluator.setProfile(null);
      await this.enqueue(() => this.resetIfNeeded(true));
    }
    this.emitStatus();
  }

  /** Returns the watcher identity for consumers such as per-game shortcuts. */
  getActiveGameId(): string | null {
    const profileId = this.watcher.getActive().profileId;
    return profileId === DEFAULT_PROFILE_ID ? null : profileId;
  }

  private scheduleReaderRetry(): void {
    if (!this.enabled || this.readerRetryTimer) return;
    this.readerRetryTimer = setTimeout(() => {
      this.readerRetryTimer = null;
      if (!this.enabled) return;
      this.reader.start();
    }, TriggerProfileEngine.READER_RETRY_MS);
  }

  private clearReaderRetry(): void {
    if (this.readerRetryTimer) {
      clearTimeout(this.readerRetryTimer);
      this.readerRetryTimer = null;
    }
  }

  async suspend(): Promise<void> {
    if (this.suspended) return;
    this.suspended = true;
    this.draftPreview = null;
    this.draftEvaluator.setProfile(null);
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

  /**
   * Live-previews an in-editor draft: non-null draft slots replace the active
   * profile's triggers (bases and modifiers) until cleared with null. No-op
   * while the engine is disabled or suspended; clearing always drops the
   * stored draft, and re-applies the active profile's effects when running.
   */
  async setDraftPreview(triggers: DraftPreviewTriggers | null): Promise<void> {
    if (triggers === null) {
      const hadPreview = this.draftPreview !== null;
      this.draftPreview = null;
      this.draftEvaluator.setProfile(null);
      if (!hadPreview || !this.enabled || this.suspended) return;
      await this.enqueue(() => this.applyBasesJob());
      return;
    }
    if (!this.enabled || this.suspended) return;
    const draftProfile: TriggerProfile = {
      version: 1,
      id: '__draft-preview__',
      name: 'Draft Preview',
      match: { processNames: [], windowTitles: [] },
      triggers: {
        l2: triggers.l2 ?? { base: null, modifiers: [] },
        r2: triggers.r2 ?? { base: null, modifiers: [] }
      },
      updatedAtMs: 0
    };
    this.draftPreview = draftProfile;
    this.draftEvaluator.setProfile(draftProfile);
    await this.enqueue(() => this.applyBasesJob());
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
      matchedName: active.matchedName,
      activeStateName: this.stateSwitcher.activeStateName
    };
  }

  /**
   * Manually selects the active profile's named state (UI/IPC path). The
   * correction mechanism when open-loop switching drifts, so it works even
   * while the menu guard is up; a no-op for unknown names and profiles
   * without states.
   */
  async selectState(name: string): Promise<EngineStatus> {
    const result = this.stateSwitcher.select(name);
    if (result.changed) {
      this.evaluator.setProfile(this.activeProfileView());
      if (this.enabled && !this.suspended) {
        await this.enqueue(() => this.applyBasesJob());
      }
      this.emitStatus();
    }
    return this.getStatus();
  }

  /** The active state's slots when the profile has states; the profile's own otherwise. */
  private activeEffectiveTriggers(): TriggerSlotPair | null {
    if (!this.activeProfile) return null;
    if (this.activeProfile.states && this.activeProfile.states.length > 0) {
      return this.stateSwitcher.activeTriggers ?? this.activeProfile.triggers;
    }
    return this.activeProfile.triggers;
  }

  /** The active profile with its triggers replaced by the active state's, for the evaluator. */
  private activeProfileView(): TriggerProfile | null {
    const profile = this.activeProfile;
    if (!profile) return null;
    const triggers = this.activeEffectiveTriggers();
    if (!triggers || triggers === profile.triggers) return profile;
    return { ...profile, triggers };
  }

  private async onActiveProfileChange(change: ActiveProfileChange): Promise<void> {
    if (!this.enabled) return;
    this.activeProfile = this.store.get(change.profileId);
    this.stateSwitcher.setProfile(this.activeProfile);
    this.evaluator.setProfile(this.activeProfileView());
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
    const triggers = this.draftPreview ? this.draftPreview.triggers : this.activeEffectiveTriggers();
    const l2 = triggers?.l2.base ?? null;
    const r2 = triggers?.r2.base ?? null;
    await this.writeDesired({ l2, r2 });
  }

  private static readonly STICK_SAMPLE_INTERVAL_MS = 33;
  private lastStickSampleAtMs = 0;

  private onInput(state: ControllerInputState): void {
    // Emitted before the profile guards: the wheel configurator's live preview
    // needs stick positions even when no profile is active.
    const now = Date.now();
    if (now - this.lastStickSampleAtMs >= TriggerProfileEngine.STICK_SAMPLE_INTERVAL_MS) {
      this.lastStickSampleAtMs = now;
      this.emit('stickSample', { lx: state.lx, ly: state.ly, buttons: [...state.buttons] });
    }
    if (!this.enabled || this.suspended) return;
    const profile = this.draftPreview ?? this.activeProfile;
    if (!profile) return;
    // A draft preview freezes state switching: the editor is previewing one
    // state's feel, and rule presses while editing shouldn't move the state.
    if (!this.draftPreview && this.stateSwitcher.hasRules()) {
      const result = this.stateSwitcher.update(state);
      if (result.changed) {
        this.evaluator.setProfile(this.activeProfileView());
        void this.enqueue(() => this.applyBasesJob());
        this.emitStatus();
      }
    }
    const triggers = this.draftPreview ? this.draftPreview.triggers : this.activeEffectiveTriggers();
    if (!triggers) return;
    const hasModifiers =
      triggers.l2.modifiers.length > 0 ||
      triggers.r2.modifiers.length > 0;
    if (!hasModifiers) return;
    const evaluator = this.draftPreview ? this.draftEvaluator : this.evaluator;
    const resolved = evaluator.update(state);
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
      if (effectSpecEquals(effect, this.lastApplied[trigger])) continue;
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
      } else if (needsV2(effect)) {
        await this.sink.applyAdaptiveTriggerEffectV2({ ...effect, target: trigger });
      } else {
        await this.sink.applyAdaptiveTriggerEffect(toPreviewEffect(effect as ClassicV1Effect, trigger));
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
