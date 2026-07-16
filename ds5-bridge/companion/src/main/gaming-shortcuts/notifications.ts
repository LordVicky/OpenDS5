import type { ControllerButton } from '../../shared/controller-input';
import type { GamingShortcutAction } from '../../shared/gaming-shortcuts';

export interface ShortcutBinding {
  button: ControllerButton;
  action: GamingShortcutAction;
  label?: string;
}

export type GamingShortcutResult = {
  status: 'success' | 'unavailable' | 'failure';
  title: string;
  body?: string;
  replaceGroup?: string;
};

export interface GamingShortcutNotifications {
  showShortcutReference(bindings: ShortcutBinding[]): Promise<void>;
  showShortcutMode(bindings: ShortcutBinding[], timeoutMs: number): Promise<void>;
  showActionResult(result: GamingShortcutResult): Promise<void>;
  showActionError(error: GamingShortcutResult): Promise<void>;
  dismissShortcutNotification(): Promise<void>;
}

const BUTTON_LABELS: Record<ControllerButton, string> = {
  cross: 'Cross', circle: 'Circle', square: 'Square', triangle: 'Triangle',
  l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', l3: 'L3', r3: 'R3',
  create: 'Create', options: 'Options', ps: 'PS', touchpad: 'Touchpad', mute: 'Mute',
  'dpad-up': 'D-pad Up', 'dpad-down': 'D-pad Down', 'dpad-left': 'D-pad Left', 'dpad-right': 'D-pad Right'
};

const ACTION_LABELS: Record<string, string> = {
  screenshot: 'Screenshot', 'recording-toggle': 'Recording', 'performance-hud-toggle': 'HUD',
  'microphone-mute-toggle': 'Microphone', 'on-screen-keyboard': 'Keyboard',
  'switch-application': 'Switch app', volume: 'Volume', 'open-opends5': 'OpenDS5',
  'quit-active-game': 'Quit game', 'custom-executable': 'Custom action', 'launch-app': 'Launch app', 'focus-app': 'Focus app'
};

export function buttonLabel(button: ControllerButton): string {
  return BUTTON_LABELS[button] ?? button;
}

export function actionLabel(action: GamingShortcutAction): string {
  return ACTION_LABELS[action.type] ?? 'Action';
}

export function formatShortcutBindings(bindings: ShortcutBinding[], maxBindings = 8): string {
  const visible = bindings.filter(({ action }) => action.type !== 'none' && action.type !== 'passthrough').slice(0, maxBindings);
  const lines = visible.map(({ button, action, label }) => `${label ?? buttonLabel(button)}  ${actionLabel(action)}`);
  if (visible.length < bindings.filter(({ action }) => action.type !== 'none' && action.type !== 'passthrough').length) lines.push('More shortcuts configured');
  return lines.length > 0 ? lines.join('\n') : 'No shortcuts configured';
}

export function actionResult(action: GamingShortcutAction, result: { ok: boolean; reason?: string; error?: string }): GamingShortcutResult {
  const label = actionLabel(action);
  if (result.ok) {
    return { status: 'success', title: label === 'Screenshot' ? 'Screenshot saved' : `${label} complete`, replaceGroup: action.type === 'volume' ? 'gaming-volume' : `gaming-${action.type}` };
  }
  if (result.reason === 'unavailable') {
    return { status: 'unavailable', title: `${label} unavailable`, body: result.error ?? 'Install the required provider or select another one.', replaceGroup: `gaming-${action.type}` };
  }
  return { status: 'failure', title: `${label} failed`, body: result.error ?? 'The action could not be completed.', replaceGroup: `gaming-${action.type}` };
}
