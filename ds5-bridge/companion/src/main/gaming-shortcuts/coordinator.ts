import { EventEmitter } from 'node:events';
import type { ControllerInputState } from '../../shared/trigger-modifier-eval';
import { resolveGamingShortcutBindings, type GamingShortcutAction, type GamingShortcutsSettings } from '../../shared/gaming-shortcuts';
import type { ControllerButton } from '../../shared/controller-input';
import { ActionExecutor, type ActionExecutionResult } from './action-executor';
import { GestureEngine, type ControllerGesture } from './gesture-engine';
import { actionResult, type GamingShortcutNotifications, type ShortcutBinding } from './notifications';

export interface InputSource {
  on(event: 'input', listener: (state: ControllerInputState) => void): this;
  off(event: 'input', listener: (state: ControllerInputState) => void): this;
}

export interface ShortcutSettingsSource { get(): { gamingShortcuts: GamingShortcutsSettings }; }

export type GamingShortcutMode =
  | { state: 'inactive' }
  | { state: 'awaiting-selection'; activatedAt: number; expiresAt: number }
  | { state: 'executing'; actionId: string };

export interface ShortcutExecutionResult {
  gesture: ControllerGesture;
  action: GamingShortcutAction;
  result: ActionExecutionResult;
}

/** Routes controller gestures to actions and notification-driven temporary mode. */
export class GamingShortcutsCoordinator extends EventEmitter {
  private readonly input: InputSource;
  private readonly settingsStore: ShortcutSettingsSource;
  private readonly executor: ActionExecutor;
  private readonly activeGameId: () => string | null;
  private readonly notifications: GamingShortcutNotifications | null;
  private readonly onInputBound: (state: ControllerInputState) => void;
  private gestureEngine: GestureEngine;
  private settings: GamingShortcutsSettings;
  private running = false;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private previousButtons = new Set<ControllerButton>();
  private mode: GamingShortcutMode = { state: 'inactive' };
  private modeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    input: InputSource;
    settingsStore: ShortcutSettingsSource;
    executor?: ActionExecutor;
    activeGameId?: () => string | null;
    notifications?: GamingShortcutNotifications;
  }) {
    super();
    this.input = options.input;
    this.settingsStore = options.settingsStore;
    this.executor = options.executor ?? new ActionExecutor();
    this.activeGameId = options.activeGameId ?? (() => null);
    this.notifications = options.notifications ?? null;
    this.settings = this.settingsStore.get().gamingShortcuts;
    this.gestureEngine = this.createGestureEngine(this.settings);
    this.onInputBound = (state) => this.handleInput(state);
  }

  start(): void { if (!this.running) { this.running = true; this.input.on('input', this.onInputBound); } }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.input.off('input', this.onInputBound);
    this.gestureEngine.reset();
    this.previousButtons.clear();
    this.exitShortcutMode();
  }

  disconnect(): void { this.previousButtons.clear(); this.gestureEngine.reset(); this.exitShortcutMode(); }

  reload(): void {
    const next = this.settingsStore.get().gamingShortcuts;
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.settings = next;
    this.gestureEngine = this.createGestureEngine(next);
    if (wasRunning) this.start();
  }

  getMode(): GamingShortcutMode { return this.mode; }

  previewShortcutNotification(): Promise<void> {
    return this.showShortcutReference();
  }

  private handleInput(state: ControllerInputState): void {
    this.gestureEngine.update(state.buttons, state.timestampMs);
    const justPressed = [...state.buttons].filter((button) => !this.previousButtons.has(button));
    this.previousButtons = new Set(state.buttons);
    if (!this.settings.enabled || this.mode.state !== 'awaiting-selection') return;
    for (const button of justPressed) {
      if (button === 'ps') { this.exitShortcutMode(); return; }
      if (button === 'circle') { this.exitShortcutMode(); return; }
      const action = this.actionForButton(button);
      if (action) { this.exitShortcutMode(); this.dispatchAction(action, { type: 'chord', modifier: 'ps', button }); return; }
    }
  }

  private createGestureEngine(settings: GamingShortcutsSettings): GestureEngine {
    return new GestureEngine({
      doublePressWindowMs: settings.doublePressWindowMs,
      longPressThresholdMs: settings.longPressThresholdMs,
      chordWindowMs: settings.chordWindowMs,
      emit: (gesture) => this.handleGesture(gesture)
    });
  }

  private handleGesture(gesture: ControllerGesture): void {
    if (!this.settings.enabled) return;
    if (gesture.type === 'chord') {
      if (!this.settings.directChordsEnabled) return;
      this.exitShortcutMode();
      const action = this.actionFor(gesture);
      if (action) this.dispatchAction(action, gesture);
      return;
    }
    if (gesture.button !== 'ps') return;
    if (gesture.type === 'single-press') {
      const action = this.bindings().singlePress;
      if (action.type !== 'none' && action.type !== 'passthrough') {
        this.dispatchAction(action, gesture);
        return;
      }
      switch (this.settings.psPressAction) {
        case 'show-shortcut-reference': void this.showShortcutReference(); return;
        case 'enter-shortcut-mode': if (this.settings.shortcutModeEnabled) { this.enterShortcutMode(); return; } return;
        case 'open-opends5': this.dispatchAction({ type: 'open-opends5' }, gesture); return;
        default: return;
      }
    }
    const action = gesture.type === 'double-press' ? this.bindings().doublePress : this.bindings().longPress;
    if (action.type !== 'none' && action.type !== 'passthrough') this.dispatchAction(action, gesture);
  }

  private bindings() { return resolveGamingShortcutBindings(this.settings, this.activeGameId()); }
  private actionFor(gesture: Extract<ControllerGesture, { type: 'chord' }>): GamingShortcutAction | null {
    return this.bindings().chords.find((candidate) => candidate.button === gesture.button)?.action ?? null;
  }
  private actionForButton(button: ControllerButton): GamingShortcutAction | null {
    return this.bindings().chords.find((candidate) => candidate.button === button)?.action ?? null;
  }

  private shortcutBindings(): ShortcutBinding[] {
    const bindings = this.bindings();
    return [
      { button: 'ps' as const, label: 'PS press', action: bindings.singlePress },
      { button: 'ps' as const, label: 'PS double press', action: bindings.doublePress },
      { button: 'ps' as const, label: 'PS hold', action: bindings.longPress },
      ...bindings.chords.map(({ button, action }) => ({ button, action }))
    ];
  }

  private enterShortcutMode(): void {
    this.clearModeTimer();
    const now = Date.now();
    this.mode = { state: 'awaiting-selection', activatedAt: now, expiresAt: now + this.settings.shortcutModeTimeoutMs };
    this.modeTimer = setTimeout(() => this.exitShortcutMode(), this.settings.shortcutModeTimeoutMs);
    void this.notifications?.showShortcutMode(this.shortcutBindings(), this.settings.shortcutModeTimeoutMs);
    this.emit('mode', this.mode);
  }

  private exitShortcutMode(): void {
    this.clearModeTimer();
    if (this.mode.state === 'inactive') return;
    this.mode = { state: 'inactive' };
    void this.notifications?.dismissShortcutNotification();
    this.emit('mode', this.mode);
  }

  private clearModeTimer(): void { if (this.modeTimer) clearTimeout(this.modeTimer); this.modeTimer = null; }

  private async showShortcutReference(): Promise<void> {
    await this.notifications?.showShortcutReference(this.shortcutBindings());
  }

  private dispatchAction(action: GamingShortcutAction, gesture: ControllerGesture): void {
    if (action.type === 'none' || action.type === 'passthrough') return;
    this.dispatchQueue = this.dispatchQueue.then(async () => {
      const result = await this.executor.execute(action);
      const notification = actionResult(action, result);
      if (result.ok) {
        if (this.settings.showSuccessNotifications) await this.notifications?.showActionResult(notification);
      } else if (this.settings.showErrorNotifications) {
        await this.notifications?.showActionError(notification);
      }
      this.emit('result', { gesture, action, result } satisfies ShortcutExecutionResult);
    }).catch((error: unknown) => {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    });
  }
}

export type { ControllerButton };
