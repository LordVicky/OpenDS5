import type { ControllerButton } from '../../shared/controller-input';

export type ControllerGesture =
  | { type: 'single-press'; button: ControllerButton }
  | { type: 'double-press'; button: ControllerButton }
  | { type: 'long-press'; button: ControllerButton; durationMs: number }
  | { type: 'chord'; modifier: 'ps'; button: ControllerButton };

export type GestureTimer = ReturnType<typeof setTimeout>;
export type GestureScheduler = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
export interface GestureEngineOptions {
  doublePressWindowMs?: number;
  longPressThresholdMs?: number;
  chordWindowMs?: number;
  scheduler?: GestureScheduler;
  emit?: (gesture: ControllerGesture) => void;
}

const DEFAULTS = { doublePressWindowMs: 300, longPressThresholdMs: 650, chordWindowMs: 150 };
const SECONDARY = new Set<ControllerButton>([
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3',
  'create', 'options', 'touchpad', 'mute', 'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right'
]);

export class GestureEngine {
  private readonly scheduler: GestureScheduler;
  private readonly emitGesture: (gesture: ControllerGesture) => void;
  private readonly doubleWindow: number;
  private readonly longThreshold: number;
  private readonly chordWindow: number;
  private held = new Set<ControllerButton>();
  private pressedAt = new Map<ControllerButton, number>();
  private longTimer: GestureTimer | null = null;
  private singleTimer: GestureTimer | null = null;
  private longEmitted = false;
  private chordEmitted = false;
  private chordCycle = false;
  private psPressAt: number | null = null;

  constructor(options: GestureEngineOptions = {}) {
    this.doubleWindow = options.doublePressWindowMs ?? DEFAULTS.doublePressWindowMs;
    this.longThreshold = options.longPressThresholdMs ?? DEFAULTS.longPressThresholdMs;
    this.chordWindow = options.chordWindowMs ?? DEFAULTS.chordWindowMs;
    if (![this.doubleWindow, this.longThreshold, this.chordWindow].every(Number.isFinite) ||
        this.doubleWindow <= 0 || this.longThreshold <= 0 || this.chordWindow <= 0) throw new Error('Gesture timing values must be positive finite numbers.');
    this.scheduler = options.scheduler ?? globalThis;
    this.emitGesture = options.emit ?? (() => undefined);
  }

  update(buttons: ReadonlySet<ControllerButton>, now = Date.now()): void {
    const next = new Set([...buttons].filter((button) => button === 'ps' || SECONDARY.has(button)));
    for (const button of next) if (!this.held.has(button)) this.press(button, now);
    for (const button of this.held) if (!next.has(button)) this.release(button);
    this.held = next;
  }

  reset(): void { this.clearTimers(); this.held.clear(); this.pressedAt.clear(); this.longEmitted = false; this.chordEmitted = false; this.chordCycle = false; this.psPressAt = null; }
  stop(): void { this.reset(); }

  private press(button: ControllerButton, now: number): void {
    this.pressedAt.set(button, now);
    if (button === 'ps') {
      if (this.singleTimer) this.clearSingleTimer();
      this.psPressAt = now; this.longEmitted = false; this.chordEmitted = false; this.chordCycle = false;
      this.longTimer = this.scheduler.setTimeout(() => {
        if (this.held.has('ps') && !this.chordEmitted) { this.longEmitted = true; this.emitGesture({ type: 'long-press', button: 'ps', durationMs: this.longThreshold }); }
      }, this.longThreshold);
      for (const secondary of this.held) {
        const secondaryAt = this.pressedAt.get(secondary);
        if (secondaryAt !== undefined && now - secondaryAt <= this.chordWindow) { this.chord(secondary); break; }
      }
      return;
    }
    if (this.held.has('ps') && this.psPressAt !== null && now - this.psPressAt <= this.chordWindow) this.chord(button);
  }

  private chord(button: ControllerButton): void { if (this.chordEmitted) return; this.chordEmitted = true; this.chordCycle = true; this.clearLongTimer(); this.clearSingleTimer(); this.emitGesture({ type: 'chord', modifier: 'ps', button }); }
  private release(button: ControllerButton): void {
    if (button !== 'ps') { this.pressedAt.delete(button); if (this.held.has('ps')) this.chordEmitted = false; return; }
    this.clearLongTimer();
    if (this.chordCycle || this.longEmitted) return;
    if (this.singleTimer) { this.scheduler.clearTimeout(this.singleTimer); this.singleTimer = null; this.emitGesture({ type: 'double-press', button: 'ps' }); }
    else this.singleTimer = this.scheduler.setTimeout(() => { this.singleTimer = null; this.emitGesture({ type: 'single-press', button: 'ps' }); }, this.doubleWindow);
  }
  private clearLongTimer(): void { if (this.longTimer) { this.scheduler.clearTimeout(this.longTimer); this.longTimer = null; } }
  private clearSingleTimer(): void { if (this.singleTimer) { this.scheduler.clearTimeout(this.singleTimer); this.singleTimer = null; } }
  private clearTimers(): void { this.clearLongTimer(); this.clearSingleTimer(); }
}
