import type { ControllerButton } from './controller-input';

export type CaptureProvider = 'auto' | 'portal' | 'grim' | 'hyprshot' | 'gnome-screenshot' | 'spectacle' | 'scrot';
export type RecordingProvider = 'auto' | 'gpu-screen-recorder';
export type HudProvider = 'auto' | 'gamescope' | 'mangohud';
export type GamingShortcutPressAction = 'show-shortcut-reference' | 'enter-shortcut-mode' | 'open-opends5' | 'none';
export type KeyboardProvider = 'auto' | 'portal' | 'wvkbd' | 'onboard' | 'matchbox-keyboard' | 'squeekboard';

export type GamingShortcutAction =
  | { type: 'none' }
  | { type: 'passthrough' }
  | { type: 'open-opends5' }
  | { type: 'launch-app'; executable: string; args: string[] }
  | { type: 'volume'; direction: 'up' | 'down' | 'mute' }
  | { type: 'microphone-mute-toggle' }
  | { type: 'screenshot'; provider: CaptureProvider }
  | { type: 'recording-toggle'; provider: RecordingProvider }
  | { type: 'performance-hud-toggle'; provider: HudProvider }
  | { type: 'on-screen-keyboard'; provider: KeyboardProvider }
  | { type: 'custom-executable'; executable: string; args: string[] };

export interface GamingShortcutBindings {
  singlePress: GamingShortcutAction;
  doublePress: GamingShortcutAction;
  longPress: GamingShortcutAction;
  chords: Array<{ button: Exclude<ControllerButton, 'ps'>; action: GamingShortcutAction }>;
}

export type GamingShortcutOverride = Partial<GamingShortcutBindings>;

export interface GamingShortcutsSettings extends GamingShortcutBindings {
  enabled: boolean;
  directChordsEnabled: boolean;
  shortcutModeEnabled: boolean;
  shortcutModeTimeoutMs: number;
  showSuccessNotifications: boolean;
  showErrorNotifications: boolean;
  psPressAction: GamingShortcutPressAction;
  doublePressWindowMs: number;
  longPressThresholdMs: number;
  chordWindowMs: number;
  perGameOverrides: Record<string, GamingShortcutOverride>;
}

export const DEFAULT_GAMING_SHORTCUTS_SETTINGS: GamingShortcutsSettings = {
  enabled: false,
  directChordsEnabled: true,
  shortcutModeEnabled: true,
  shortcutModeTimeoutMs: 3000,
  showSuccessNotifications: true,
  showErrorNotifications: true,
  psPressAction: 'enter-shortcut-mode',
  doublePressWindowMs: 300,
  longPressThresholdMs: 650,
  chordWindowMs: 150,
  singlePress: { type: 'none' },
  doublePress: { type: 'none' },
  longPress: { type: 'none' },
  chords: [],
  perGameOverrides: {}
};

const CAPTURE_PROVIDERS = new Set<CaptureProvider>(['auto', 'portal', 'grim', 'hyprshot', 'gnome-screenshot', 'spectacle', 'scrot']);
const RECORDING_PROVIDERS = new Set<RecordingProvider>(['auto', 'gpu-screen-recorder']);
const HUD_PROVIDERS = new Set<HudProvider>(['auto', 'gamescope', 'mangohud']);
const KEYBOARD_PROVIDERS = new Set<KeyboardProvider>(['auto', 'portal', 'wvkbd', 'onboard', 'matchbox-keyboard', 'squeekboard']);

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

function normalizeBindings(value: unknown): GamingShortcutOverride {
  if (!record(value)) return {};
  const result: GamingShortcutOverride = {};
  if ('singlePress' in value) result.singlePress = validateGamingShortcutAction(value.singlePress);
  if ('doublePress' in value) result.doublePress = validateGamingShortcutAction(value.doublePress);
  if ('longPress' in value) result.longPress = validateGamingShortcutAction(value.longPress);
  if (Array.isArray(value.chords)) {
    result.chords = value.chords.flatMap((entry) => {
      if (!record(entry) || typeof entry.button !== 'string' || !SECONDARY_BUTTONS.has(entry.button as Exclude<ControllerButton, 'ps'>)) return [];
      return [{ button: entry.button as Exclude<ControllerButton, 'ps'>, action: validateGamingShortcutAction(entry.action) }];
    }).slice(0, 32);
  }
  return result;
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
    case 'volume':
      return value.direction === 'up' || value.direction === 'down' || value.direction === 'mute' ? { type: 'volume', direction: value.direction } : { type: 'none' };
    case 'microphone-mute-toggle': return { type: 'microphone-mute-toggle' };
    case 'on-screen-keyboard': return member(KEYBOARD_PROVIDERS, value.provider) ? { type: 'on-screen-keyboard', provider: value.provider } : { type: 'none' };
    case 'screenshot':
      return member(CAPTURE_PROVIDERS, value.provider) ? { type: 'screenshot', provider: value.provider } : { type: 'none' };
    case 'recording-toggle':
      return member(RECORDING_PROVIDERS, value.provider) ? { type: 'recording-toggle', provider: value.provider } : { type: 'none' };
    case 'performance-hud-toggle':
      return member(HUD_PROVIDERS, value.provider) ? { type: 'performance-hud-toggle', provider: value.provider } : { type: 'none' };
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
  const perGameOverrides: Record<string, GamingShortcutOverride> = {};
  if (record(value.perGameOverrides)) {
    for (const [gameId, override] of Object.entries(value.perGameOverrides)) {
      if (gameId.length > 0 && gameId.length <= 256) perGameOverrides[gameId] = normalizeBindings(override);
    }
  }
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_GAMING_SHORTCUTS_SETTINGS.enabled,
    directChordsEnabled: typeof value.directChordsEnabled === 'boolean' ? value.directChordsEnabled : DEFAULT_GAMING_SHORTCUTS_SETTINGS.directChordsEnabled,
    shortcutModeEnabled: typeof value.shortcutModeEnabled === 'boolean' ? value.shortcutModeEnabled : DEFAULT_GAMING_SHORTCUTS_SETTINGS.shortcutModeEnabled,
    shortcutModeTimeoutMs: timing(value.shortcutModeTimeoutMs, 3000, 1000, 10000),
    showSuccessNotifications: typeof value.showSuccessNotifications === 'boolean' ? value.showSuccessNotifications : DEFAULT_GAMING_SHORTCUTS_SETTINGS.showSuccessNotifications,
    showErrorNotifications: typeof value.showErrorNotifications === 'boolean' ? value.showErrorNotifications : DEFAULT_GAMING_SHORTCUTS_SETTINGS.showErrorNotifications,
    psPressAction: value.psPressAction === 'show-shortcut-reference' || value.psPressAction === 'enter-shortcut-mode' || value.psPressAction === 'open-opends5' || value.psPressAction === 'none'
      ? value.psPressAction
      : DEFAULT_GAMING_SHORTCUTS_SETTINGS.psPressAction,
    doublePressWindowMs: timing(value.doublePressWindowMs, 300, 100, 1000),
    longPressThresholdMs: timing(value.longPressThresholdMs, 650, 300, 2000),
    chordWindowMs: timing(value.chordWindowMs, 150, 50, 500),
    singlePress: validateGamingShortcutAction(value.singlePress),
    doublePress: validateGamingShortcutAction(value.doublePress),
    longPress: validateGamingShortcutAction(value.longPress),
    chords,
    perGameOverrides
  };
}

/** Resolves bindings without changing global timing or enablement settings. */
export function resolveGamingShortcutBindings(
  settings: GamingShortcutsSettings,
  gameId: string | null
): GamingShortcutBindings {
  const override = gameId === null ? undefined : settings.perGameOverrides[gameId];
  return {
    singlePress: override?.singlePress ?? settings.singlePress,
    doublePress: override?.doublePress ?? settings.doublePress,
    longPress: override?.longPress ?? settings.longPress,
    chords: override?.chords ?? settings.chords
  };
}
