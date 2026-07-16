import type { ControllerInputState } from './trigger-modifier-eval';
import {
  defaultStateIndex,
  profileStateList,
  type TriggerProfile,
  type TriggerStateDef
} from './trigger-profiles';

export interface StateSwitchResult {
  index: number;
  changed: boolean;
  menuSuspended: boolean;
}

/**
 * Tracks a multi-state profile's active state from the controller input
 * stream. Switching is open-loop inference: rules fire on button press edges,
 * the menu guard keeps menu navigation from corrupting the tracked state, and
 * select() is the manual re-anchor when inference drifts.
 */
export class StateSwitcher {
  private states: TriggerStateDef[] = [];
  private profile: TriggerProfile | null = null;
  private index = 0;
  private menuSuspended = false;
  private menuOpenedAtMs = 0;
  private previousButtons: ReadonlySet<string> = new Set();

  setProfile(profile: TriggerProfile | null): void {
    this.profile = profile;
    this.states = profile ? profileStateList(profile) : [];
    this.index = profile ? defaultStateIndex(profile) : 0;
    this.menuSuspended = false;
    this.previousButtons = new Set();
  }

  get activeIndex(): number {
    return this.index;
  }

  get activeStateName(): string | null {
    if (!this.profile?.states || this.profile.states.length === 0) return null;
    return this.states[this.index]?.name ?? null;
  }

  get activeTriggers(): TriggerStateDef['triggers'] | null {
    return this.states[this.index]?.triggers ?? null;
  }

  /** True when the input stream can change the active state. */
  hasRules(): boolean {
    return (this.profile?.switching?.rules.length ?? 0) > 0 && this.states.length > 1;
  }

  /** Manual selection (UI/IPC). Bypasses the menu guard by design. */
  select(name: string): StateSwitchResult {
    const target = this.states.findIndex((state) => state.name === name);
    const changed = target >= 0 && target !== this.index;
    if (target >= 0) this.index = target;
    return { index: this.index, changed, menuSuspended: this.menuSuspended };
  }

  update(state: ControllerInputState): StateSwitchResult {
    const switching = this.profile?.switching;
    if (!switching || this.states.length < 2) {
      this.previousButtons = new Set(state.buttons);
      return { index: this.index, changed: false, menuSuspended: false };
    }
    const pressed: string[] = [];
    for (const button of state.buttons) {
      if (!this.previousButtons.has(button)) pressed.push(button);
    }
    this.previousButtons = new Set(state.buttons);

    if (
      this.menuSuspended &&
      switching.menuTimeoutMs &&
      state.timestampMs - this.menuOpenedAtMs >= switching.menuTimeoutMs
    ) {
      this.menuSuspended = false;
    }

    const startIndex = this.index;
    for (const button of pressed) {
      if (switching.menuButtons?.includes(button)) {
        this.menuSuspended = !this.menuSuspended;
        if (this.menuSuspended) this.menuOpenedAtMs = state.timestampMs;
        continue;
      }
      if (this.menuSuspended) continue;
      const rule = switching.rules.find(
        (candidate) => candidate.button === button && (!candidate.while || state.buttons.has(candidate.while))
      );
      if (!rule) continue;
      if (rule.action === 'cycle') {
        this.index = (this.index + 1) % this.states.length;
      } else if (rule.state !== undefined) {
        const target = this.states.findIndex((candidate) => candidate.name === rule.state);
        if (target >= 0) this.index = target;
      }
    }
    return { index: this.index, changed: this.index !== startIndex, menuSuspended: this.menuSuspended };
  }
}
