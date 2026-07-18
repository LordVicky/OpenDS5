import { EventEmitter } from 'node:events';
import type { ControllerInputState } from '../../shared/trigger-modifier-eval';
import { resolveGamingShortcutBindings, type GamingShortcutAction, type GamingShortcutsSettings } from '../../shared/gaming-shortcuts';
import { isControllerButton, type ControllerButton } from '../../shared/controller-input';
import { ActionExecutor, type ActionExecutionResult } from './action-executor';
import { GestureEngine, type ControllerGesture } from './gesture-engine';
import { actionResult, type GamingShortcutNotifications, type ShortcutBinding } from './notifications';

export interface InputSource {
  on(event: 'input', listener: (state: ControllerInputState) => void): this;
  off(event: 'input', listener: (state: ControllerInputState) => void): this;
  on(event: 'disconnect', listener: (sourceId: string) => void): this;
  off(event: 'disconnect', listener: (sourceId: string) => void): this;
}

export interface ShortcutSettingsSource { get(): { gamingShortcuts: GamingShortcutsSettings }; }

export type GamingShortcutMode =
  | { state: 'inactive' }
  | { state: 'awaiting-selection'; activatedAt: number; expiresAt: number }
  | { state: 'executing'; actionId: string };

export interface GamingShortcutInvocation {
  controllerId: string;
  gesture: ControllerGesture;
}

export interface ShortcutExecutionResult extends GamingShortcutInvocation {
  controllerId: string;
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
  private readonly controllerIdForSource: (sourceId: string | null) => string | null;
  private inputControllerId: string | null = null;
  private readonly onInputBound: (state: ControllerInputState) => void;
  private readonly onDisconnectBound: (sourceId: string) => void;
  private gestureEngines = new Map<string, GestureEngine>();
  private settings: GamingShortcutsSettings;
  private running = false;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private previousButtons = new Map<string, Set<ControllerButton>>();
  private mode: GamingShortcutMode = { state: 'inactive' };
  private modeSourceKey: string | null = null;
  private modeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sourceGenerations = new Map<string, number>();

  constructor(options: {
    input: InputSource;
    settingsStore: ShortcutSettingsSource;
    executor?: ActionExecutor;
    activeGameId?: () => string | null;
    notifications?: GamingShortcutNotifications;
    controllerIdForSource?: (sourceId: string | null) => string | null;
  }) {
    super();
    this.input = options.input;
    this.settingsStore = options.settingsStore;
    this.executor = options.executor ?? new ActionExecutor();
    this.activeGameId = options.activeGameId ?? (() => null);
    this.notifications = options.notifications ?? null;
    this.controllerIdForSource = options.controllerIdForSource ?? (() => null);
    this.settings = this.settingsStore.get().gamingShortcuts;
    this.onInputBound = (state) => this.handleInput(state);
    this.onDisconnectBound = (sourceId) => this.disconnectSourceForInput(sourceId);
  }

  start(): void { if (!this.running) { this.running = true; this.input.on('input', this.onInputBound); this.input.on('disconnect', this.onDisconnectBound); } }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.invalidateAllSources();
    this.input.off('input', this.onInputBound);
    this.input.off('disconnect', this.onDisconnectBound);
    for (const engine of this.gestureEngines.values()) engine.reset();
    this.gestureEngines.clear(); this.previousButtons.clear();
    this.exitShortcutMode();
  }

  disconnect(): void { this.invalidateAllSources(); this.inputControllerId = null; for (const engine of this.gestureEngines.values()) engine.reset(); this.gestureEngines.clear(); this.previousButtons.clear(); this.exitShortcutMode(); }

  disconnectSourceForInput(sourceId: string): void {
    const sourceKey = sourceId || 'legacy-input';
    this.sourceGenerations.set(sourceKey, (this.sourceGenerations.get(sourceKey) ?? 0) + 1);
    const controllerId = this.controllerIdForSource(sourceId);
    this.gestureEngines.get(sourceKey)?.reset();
    this.gestureEngines.delete(sourceKey);
    this.previousButtons.delete(sourceKey);
    if (this.modeSourceKey === sourceKey) this.exitShortcutMode();
    if (this.inputControllerId === controllerId) this.inputControllerId = null;
  }

  reload(): void {
    const next = this.settingsStore.get().gamingShortcuts;
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.settings = next;
    this.gestureEngines.clear();
    if (wasRunning) this.start();
  }

  getMode(): GamingShortcutMode { return this.mode; }

  previewShortcutNotification(): Promise<void> {
    return this.showShortcutReference();
  }

  private handleInput(state: ControllerInputState): void {
    const sourceKey = state.sourceId ?? 'legacy-input';
    const sourceControllerId = this.controllerIdForSource(state.sourceId ?? null);
    this.inputControllerId = sourceControllerId;
    const engine = this.gestureEngines.get(sourceKey) ?? this.createGestureEngine(this.settings, sourceKey);
    this.gestureEngines.set(sourceKey, engine);
    const buttons = new Set([...state.buttons].filter(isControllerButton));
    engine.update(buttons, state.timestampMs, sourceControllerId);
    const previousButtons = this.previousButtons.get(sourceKey) ?? new Set<ControllerButton>();
    const justPressed = [...buttons].filter((button) => !previousButtons.has(button));
    this.previousButtons.set(sourceKey, buttons);
    if (!this.settings.enabled || this.mode.state !== 'awaiting-selection' || this.modeSourceKey !== sourceKey) return;
    for (const button of justPressed) {
      if (button === 'ps') { this.exitShortcutMode(); return; }
      if (button === 'circle') { this.exitShortcutMode(); return; }
      const action = this.actionForButton(button);
      if (action) { this.exitShortcutMode(); this.dispatchAction(action, { type: 'chord', modifier: 'ps', button }, sourceControllerId, sourceKey); return; }
    }
  }

  private createGestureEngine(settings: GamingShortcutsSettings, sourceKey: string): GestureEngine {
    return new GestureEngine({
      doublePressWindowMs: settings.doublePressWindowMs,
      longPressThresholdMs: settings.longPressThresholdMs,
      chordWindowMs: settings.chordWindowMs,
      emit: (gesture, sourceControllerId) => this.handleGesture(gesture, sourceControllerId, sourceKey)
    });
  }

  private handleGesture(gesture: ControllerGesture, sourceControllerId: string | null | undefined, sourceKey: string): void {
    sourceControllerId ??= null;
    if (!this.settings.enabled) return;
    if (this.mode.state === 'awaiting-selection' && this.modeSourceKey !== sourceKey) return;
    if (gesture.type === 'chord') {
      if (!this.settings.directChordsEnabled) return;
      this.exitShortcutMode();
      const action = this.actionFor(gesture);
      if (action) this.dispatchAction(action, gesture, sourceControllerId, sourceKey);
      return;
    }
    if (gesture.button !== 'ps') return;
    if (gesture.type === 'single-press') {
      const action = this.bindings().singlePress;
      if (action.type !== 'none' && action.type !== 'passthrough') {
        this.dispatchAction(action, gesture, sourceControllerId, sourceKey);
        return;
      }
      switch (this.settings.psPressAction) {
        case 'show-shortcut-reference': void this.showShortcutReference(); return;
        case 'enter-shortcut-mode': if (this.settings.shortcutModeEnabled) { this.enterShortcutMode(sourceKey); return; } return;
        case 'open-opends5': this.dispatchAction({ type: 'open-opends5' }, gesture, sourceControllerId, sourceKey); return;
        default: return;
      }
    }
    const action = gesture.type === 'double-press' ? this.bindings().doublePress : this.bindings().longPress;
    if (action.type !== 'none' && action.type !== 'passthrough') this.dispatchAction(action, gesture, sourceControllerId, sourceKey);
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

  private enterShortcutMode(sourceKey: string): void {
    this.clearModeTimer();
    const now = Date.now();
    this.modeSourceKey = sourceKey;
    this.mode = { state: 'awaiting-selection', activatedAt: now, expiresAt: now + this.settings.shortcutModeTimeoutMs };
    this.modeTimer = setTimeout(() => this.exitShortcutMode(), this.settings.shortcutModeTimeoutMs);
    void this.notifications?.showShortcutMode(this.shortcutBindings(), this.settings.shortcutModeTimeoutMs);
    this.emit('mode', this.mode);
  }

  private exitShortcutMode(): void {
    this.clearModeTimer();
    if (this.mode.state === 'inactive') return;
    this.mode = { state: 'inactive' };
    this.modeSourceKey = null;
    void this.notifications?.dismissShortcutNotification();
    this.emit('mode', this.mode);
  }

  private clearModeTimer(): void { if (this.modeTimer) clearTimeout(this.modeTimer); this.modeTimer = null; }

  private invalidateAllSources(): void {
    for (const sourceKey of this.gestureEngines.keys()) {
      this.sourceGenerations.set(sourceKey, (this.sourceGenerations.get(sourceKey) ?? 0) + 1);
    }
    this.sourceGenerations.set('legacy-input', (this.sourceGenerations.get('legacy-input') ?? 0) + 1);
  }

  private async showShortcutReference(): Promise<void> {
    await this.notifications?.showShortcutReference(this.shortcutBindings());
  }

  private dispatchAction(action: GamingShortcutAction, gesture: ControllerGesture, sourceControllerId = this.inputControllerId, sourceKey = 'legacy-input'): void {
    if (action.type === 'none' || action.type === 'passthrough') return;
    const generation = this.sourceGenerations.get(sourceKey) ?? 0;
    this.dispatchQueue = this.dispatchQueue.then(async () => {
      const result = await this.executor.execute(action);
      if ((this.sourceGenerations.get(sourceKey) ?? 0) !== generation) return;
      const notification = actionResult(action, result);
      if (result.ok) {
        if (this.settings.showSuccessNotifications) await this.notifications?.showActionResult(notification);
      } else if (this.settings.showErrorNotifications) await this.notifications?.showActionError(notification);
      this.emit('result', { controllerId: sourceControllerId ?? '', gesture, action, result } satisfies ShortcutExecutionResult);
    }).catch((error: unknown) => {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    });
  }
}

export type { ControllerButton };
