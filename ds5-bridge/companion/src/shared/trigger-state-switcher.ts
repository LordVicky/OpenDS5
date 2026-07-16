import type { ControllerInputState } from './trigger-modifier-eval';
import {
  defaultStateIndex,
  profileStateList,
  type StickWheelConfig,
  type TriggerProfile,
  type TriggerStateDef
} from './trigger-profiles';

const STICK_CENTER = 128;

/**
 * Maps a raw left-stick sample to a wheel sector index, or null when the
 * stick is inside the threshold dead zone. Angle 0 is 12 o'clock, clockwise,
 * with `angleOffsetDeg` subtracted before sector division.
 */
/** Angular width of each sector: declared spans, or equal slices. */
export function wheelSectorSpans(wheel: StickWheelConfig): number[] {
  return wheel.sectorSpansDeg ?? wheel.sectors.map(() => 360 / wheel.sectors.length);
}

export function stickWheelSector(wheel: StickWheelConfig, lx: number, ly: number): number | null {
  const dx = lx - STICK_CENTER;
  const dy = ly - STICK_CENTER;
  const magnitudePercent = (Math.sqrt(dx * dx + dy * dy) / STICK_CENTER) * 100;
  if (magnitudePercent < wheel.thresholdPercent) return null;
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const relative = (angle - wheel.angleOffsetDeg + 360) % 360;
  const spans = wheelSectorSpans(wheel);
  let boundary = 0;
  for (let index = 0; index < spans.length; index += 1) {
    boundary += spans[index];
    if (relative < boundary) return index;
  }
  return spans.length - 1;
}

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
  private wheelArmed = false;
  private wheelPickedState: string | null = null;

  setProfile(profile: TriggerProfile | null): void {
    this.wheelArmed = false;
    this.wheelPickedState = null;
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
    const wheel = switching.stickWheel;
    if (wheel) {
      const held = state.buttons.has(wheel.button);
      if (held) {
        this.wheelArmed = true;
        const sector = stickWheelSector(wheel, state.lx, state.ly);
        if (sector !== null && wheel.sectors[sector] !== null) {
          this.wheelPickedState = wheel.sectors[sector];
        }
      } else if (this.wheelArmed) {
        // The wheel gesture is its own guard: commit bypasses menuSuspended,
        // matching the manual re-anchor semantics of select().
        if (this.wheelPickedState !== null) {
          const target = this.states.findIndex((candidate) => candidate.name === this.wheelPickedState);
          if (target >= 0) this.index = target;
        }
        this.wheelArmed = false;
        this.wheelPickedState = null;
      }
    }
    for (const button of pressed) {
      // The wheel owns its chord button; ordinary rules on it never fire.
      if (wheel && button === wheel.button) continue;
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
