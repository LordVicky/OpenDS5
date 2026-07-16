import { EventEmitter } from 'node:events';
import type { ControllerInputState } from '../../shared/trigger-modifier-eval';
import type { GamingShortcutAction, GamingShortcutsSettings } from '../../shared/gaming-shortcuts';
import type { ControllerButton } from '../../shared/controller-input';
import type { ActionExecutionResult } from './action-executor';
import { ActionExecutor } from './action-executor';
import { GestureEngine, type ControllerGesture } from './gesture-engine';

export interface InputSource {
  on(event: 'input', listener: (state: ControllerInputState) => void): this;
  off(event: 'input', listener: (state: ControllerInputState) => void): this;
}

export interface ShortcutSettingsSource {
  get(): { gamingShortcuts: GamingShortcutsSettings };
}

export interface ShortcutExecutionResult {
  gesture: ControllerGesture;
  action: GamingShortcutAction;
  result: ActionExecutionResult;
}

/** Connects normalized controller input to validated, serialized shortcut actions. */
export class GamingShortcutsCoordinator extends EventEmitter {
  private readonly input: InputSource;
  private readonly settingsStore: ShortcutSettingsSource;
  private readonly executor: ActionExecutor;
  private readonly onInputBound: (state: ControllerInputState) => void;
  private gestureEngine: GestureEngine;
  private settings: GamingShortcutsSettings;
  private running = false;
  private dispatchQueue: Promise<void> = Promise.resolve();

  constructor(options: {
    input: InputSource;
    settingsStore: ShortcutSettingsSource;
    executor?: ActionExecutor;
  }) {
    super();
    this.input = options.input;
    this.settingsStore = options.settingsStore;
    this.executor = options.executor ?? new ActionExecutor();
    this.settings = this.settingsStore.get().gamingShortcuts;
    this.gestureEngine = this.createGestureEngine(this.settings);
    this.onInputBound = (state) => this.gestureEngine.update(state.buttons, state.timestampMs);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.input.on('input', this.onInputBound);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.input.off('input', this.onInputBound);
    this.gestureEngine.reset();
  }

  reload(): void {
    const next = this.settingsStore.get().gamingShortcuts;
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.settings = next;
    this.gestureEngine = this.createGestureEngine(next);
    if (wasRunning) this.start();
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
    const action = this.actionFor(gesture);
    if (!action || action.type === 'none' || action.type === 'passthrough') return;
    this.dispatchQueue = this.dispatchQueue
      .then(async () => {
        const result = await this.executor.execute(action);
        this.emit('result', { gesture, action, result } satisfies ShortcutExecutionResult);
      })
      .catch((error: unknown) => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      });
  }

  private actionFor(gesture: ControllerGesture): GamingShortcutAction | null {
    switch (gesture.type) {
      case 'single-press': return gesture.button === 'ps' ? this.settings.singlePress : null;
      case 'double-press': return gesture.button === 'ps' ? this.settings.doublePress : null;
      case 'long-press': return gesture.button === 'ps' ? this.settings.longPress : null;
      case 'chord': {
        const binding = this.settings.chords.find((candidate) => candidate.button === gesture.button);
        return binding?.action ?? null;
      }
    }
  }
}

export type { ControllerButton };
