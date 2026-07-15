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
  // One hold timer per modifier (keyed by its slot index): hold modifiers can
  // use different press thresholds, so they cannot share a single timer.
  heldSinceMsByModifier = new Map<number, number>();
  lastValue = 0;
  pressTimestampsMs: number[] = [];

  reset(): void {
    this.heldSinceMsByModifier.clear();
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

  // Every modifier is evaluated on every update (so hold timers keep running
  // even while another modifier is active), then the most specific match wins:
  // the longest satisfied hold duration first, list order breaking ties. This
  // is what lets several trigger-held-over modifiers escalate — 200ms feel,
  // then a different feel at 300ms — instead of the first match shadowing the
  // rest forever.
  private resolveSlot(
    trigger: TriggerName,
    slot: TriggerSlotConfig,
    state: ControllerInputState
  ): TriggerEffectSpec | null {
    let winner: TriggerEffectSpec | null = null;
    let winnerHoldMs = -1;
    slot.modifiers.forEach((modifier, index) => {
      if (!this.conditionHolds(trigger, index, modifier.when, state)) {
        return;
      }
      const holdMs = modifier.when.condition === 'trigger-held-over' ? modifier.when.ms ?? 0 : 0;
      if (holdMs > winnerHoldMs) {
        winner = modifier.effect;
        winnerHoldMs = holdMs;
      }
    });
    return winner ?? slot.base;
  }

  private conditionHolds(
    trigger: TriggerName,
    index: number,
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
          timing.heldSinceMsByModifier.delete(index);
          return false;
        }
        let heldSinceMs = timing.heldSinceMsByModifier.get(index);
        if (heldSinceMs === undefined) {
          heldSinceMs = state.timestampMs;
          timing.heldSinceMsByModifier.set(index, heldSinceMs);
        }
        return state.timestampMs - heldSinceMs >= holdMs;
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
