import type { ControllerButton } from './controller-input';

export type CaptureProvider = 'auto' | 'portal' | 'grim' | 'gnome-screenshot' | 'spectacle' | 'scrot';
export type HudProvider = 'auto' | 'gamescope' | 'mangohud';
export type KeyboardProvider = 'auto' | 'portal' | 'wvkbd' | 'onboard' | 'matchbox-keyboard';

export type GamingShortcutAction =
  | { type: 'none' }
  | { type: 'passthrough' }
  | { type: 'open-opends5' }
  | { type: 'launch-app'; executable: string; args: string[] }
  | { type: 'focus-app'; appId: string }
  | { type: 'volume'; direction: 'up' | 'down' | 'mute' }
  | { type: 'microphone-mute-toggle' }
  | { type: 'screenshot'; provider: CaptureProvider }
  | { type: 'recording-toggle'; provider: CaptureProvider }
  | { type: 'performance-hud-toggle'; provider: HudProvider }
  | { type: 'on-screen-keyboard'; provider: KeyboardProvider }
  | { type: 'switch-application'; direction: 'next' | 'previous' }
  | { type: 'quit-active-game'; confirmation: true }
  | { type: 'custom-executable'; executable: string; args: string[] };

export interface GamingShortcutBindings {
  singlePress: GamingShortcutAction;
  doublePress: GamingShortcutAction;
  longPress: GamingShortcutAction;
  chords: Array<{ button: Exclude<ControllerButton, 'ps'>; action: GamingShortcutAction }>;
}

export interface GamingShortcutsSettings extends GamingShortcutBindings {
  enabled: boolean;
  doublePressWindowMs: number;
  longPressThresholdMs: number;
  chordWindowMs: number;
}

export const DEFAULT_GAMING_SHORTCUTS_SETTINGS: GamingShortcutsSettings = {
  enabled: false,
  doublePressWindowMs: 300,
  longPressThresholdMs: 650,
  chordWindowMs: 150,
  singlePress: { type: 'none' },
  doublePress: { type: 'none' },
  longPress: { type: 'none' },
  chords: []
};

const CAPTURE_PROVIDERS = new Set<CaptureProvider>(['auto', 'portal', 'grim', 'gnome-screenshot', 'spectacle', 'scrot']);
const HUD_PROVIDERS = new Set<HudProvider>(['auto', 'gamescope', 'mangohud']);
const KEYBOARD_PROVIDERS = new Set<KeyboardProvider>(['auto', 'portal', 'wvkbd', 'onboard', 'matchbox-keyboard']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}

function args(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 64 && value.every((arg) => typeof arg === 'string' && !arg.includes('\0'));
}

function member<T extends string>(set: ReadonlySet<T>, value: unknown): value is T {
  return typeof value === 'string' && set.has(value as T);
}

/** Repairs malformed persisted data to a harmless action. */
export function validateGamingShortcutAction(value: unknown): GamingShortcutAction {
  if (!record(value) || typeof value.type !== 'string') return { type: 'none' };
  switch (value.type) {
    case 'none': return { type: 'none' };
    case 'passthrough': return { type: 'passthrough' };
    case 'open-opends5': return { type: 'open-opends5' };
    case 'launch-app':
      return string(value.executable) && args(value.args) ? { type: 'launch-app', executable: value.executable, args: value.args } : { type: 'none' };
    case 'focus-app':
      return string(value.appId) ? { type: 'focus-app', appId: value.appId } : { type: 'none' };
    case 'volume':
      return value.direction === 'up' || value.direction === 'down' || value.direction === 'mute' ? { type: 'volume', direction: value.direction } : { type: 'none' };
    case 'microphone-mute-toggle': return { type: 'microphone-mute-toggle' };
    case 'screenshot':
      return member(CAPTURE_PROVIDERS, value.provider) ? { type: 'screenshot', provider: value.provider } : { type: 'none' };
    case 'recording-toggle':
      return member(CAPTURE_PROVIDERS, value.provider) ? { type: 'recording-toggle', provider: value.provider } : { type: 'none' };
    case 'performance-hud-toggle':
      return member(HUD_PROVIDERS, value.provider) ? { type: 'performance-hud-toggle', provider: value.provider } : { type: 'none' };
    case 'on-screen-keyboard':
      return member(KEYBOARD_PROVIDERS, value.provider) ? { type: 'on-screen-keyboard', provider: value.provider } : { type: 'none' };
    case 'switch-application':
      return value.direction === 'next' || value.direction === 'previous' ? { type: 'switch-application', direction: value.direction } : { type: 'none' };
    case 'quit-active-game': return value.confirmation === true ? { type: 'quit-active-game', confirmation: true } : { type: 'none' };
    case 'custom-executable':
      return string(value.executable) && args(value.args) ? { type: 'custom-executable', executable: value.executable, args: value.args } : { type: 'none' };
    default: return { type: 'none' };
  }
}

const SECONDARY_BUTTONS = new Set<Exclude<ControllerButton, 'ps'>>([
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3',
  'create', 'options', 'touchpad', 'mute', 'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right'
]);

function timing(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

export function normalizeGamingShortcutsSettings(value: unknown): GamingShortcutsSettings {
  if (!record(value)) return { ...DEFAULT_GAMING_SHORTCUTS_SETTINGS };
  const chords = Array.isArray(value.chords)
    ? value.chords.flatMap((entry) => {
        if (!record(entry) || typeof entry.button !== 'string' || !SECONDARY_BUTTONS.has(entry.button as Exclude<ControllerButton, 'ps'>)) return [];
        return [{ button: entry.button as Exclude<ControllerButton, 'ps'>, action: validateGamingShortcutAction(entry.action) }];
      }).slice(0, 32)
    : [];
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_GAMING_SHORTCUTS_SETTINGS.enabled,
    doublePressWindowMs: timing(value.doublePressWindowMs, 300, 100, 1000),
    longPressThresholdMs: timing(value.longPressThresholdMs, 650, 300, 2000),
    chordWindowMs: timing(value.chordWindowMs, 150, 50, 500),
    singlePress: validateGamingShortcutAction(value.singlePress),
    doublePress: validateGamingShortcutAction(value.doublePress),
    longPress: validateGamingShortcutAction(value.longPress),
    chords
  };
}
