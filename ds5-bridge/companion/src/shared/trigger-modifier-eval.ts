import type { ModifierCondition, TriggerEffectSpec, TriggerProfile, TriggerSlotConfig } from './trigger-profiles';

export interface ControllerInputState {
  timestampMs: number;
  l2: number;
  r2: number;
  buttons: ReadonlySet<string>;
}

export interface ResolvedTriggerEffects {
  l2: TriggerEffectSpec | null;
  r2: TriggerEffectSpec | null;
}

const FULL_PULL_THRESHOLD = 250;
const DEFAULT_HOLD_THRESHOLD = 128;
const RAPID_FIRE_EDGE_THRESHOLD = 128;
const RAPID_FIRE_WINDOW_MS = 1000;
const DEFAULT_PRESSES_PER_SECOND = 3;

type TriggerName = 'l2' | 'r2';

class TriggerTimingState {
  heldSinceMs: number | null = null;
  lastValue = 0;
  pressTimestampsMs: number[] = [];

  reset(): void {
    this.heldSinceMs = null;
    this.lastValue = 0;
    this.pressTimestampsMs = [];
  }
}

export class ModifierEvaluator {
  private profile: TriggerProfile | null = null;
  private timing: Record<TriggerName, TriggerTimingState> = {
    l2: new TriggerTimingState(),
    r2: new TriggerTimingState()
  };

  setProfile(profile: TriggerProfile | null): void {
    this.profile = profile;
    this.timing.l2.reset();
    this.timing.r2.reset();
  }

  update(state: ControllerInputState): ResolvedTriggerEffects {
    this.trackTiming('l2', state.l2, state.timestampMs);
    this.trackTiming('r2', state.r2, state.timestampMs);
    if (!this.profile) {
      return { l2: null, r2: null };
    }
    return {
      l2: this.resolveSlot('l2', this.profile.triggers.l2, state),
      r2: this.resolveSlot('r2', this.profile.triggers.r2, state)
    };
  }

  private trackTiming(trigger: TriggerName, value: number, timestampMs: number): void {
    const timing = this.timing[trigger];
    if (value >= RAPID_FIRE_EDGE_THRESHOLD && timing.lastValue < RAPID_FIRE_EDGE_THRESHOLD) {
      timing.pressTimestampsMs.push(timestampMs);
    }
    timing.pressTimestampsMs = timing.pressTimestampsMs.filter(
      (at) => timestampMs - at <= RAPID_FIRE_WINDOW_MS
    );
    timing.lastValue = value;
  }

  private resolveSlot(
    trigger: TriggerName,
    slot: TriggerSlotConfig,
    state: ControllerInputState
  ): TriggerEffectSpec | null {
    for (const modifier of slot.modifiers) {
      if (this.conditionHolds(trigger, modifier.when, state)) {
        return modifier.effect;
      }
    }
    return slot.base;
  }

  private conditionHolds(
    trigger: TriggerName,
    when: ModifierCondition,
    state: ControllerInputState
  ): boolean {
    if (when.source !== 'input') {
      return false;
    }
    const value = trigger === 'l2' ? state.l2 : state.r2;
    const timing = this.timing[trigger];
    switch (when.condition) {
      case 'trigger-held-over': {
        const threshold = when.threshold ?? DEFAULT_HOLD_THRESHOLD;
        const holdMs = when.ms ?? 0;
        if (value < threshold) {
          timing.heldSinceMs = null;
          return false;
        }
        if (timing.heldSinceMs === null) {
          timing.heldSinceMs = state.timestampMs;
        }
        return state.timestampMs - timing.heldSinceMs >= holdMs;
      }
      case 'trigger-full-pull':
        return value >= FULL_PULL_THRESHOLD;
      case 'button-held':
        return when.button !== undefined && state.buttons.has(when.button);
      case 'rapid-fire': {
        const required = when.pressesPerSecond ?? DEFAULT_PRESSES_PER_SECOND;
        return timing.pressTimestampsMs.length >= required;
      }
      default:
        return false;
    }
  }
}
