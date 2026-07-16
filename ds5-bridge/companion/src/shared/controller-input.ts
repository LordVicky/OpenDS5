export type ControllerButton =
  | 'cross' | 'circle' | 'square' | 'triangle'
  | 'l1' | 'r1' | 'l2' | 'r2' | 'l3' | 'r3'
  | 'create' | 'options' | 'ps' | 'touchpad' | 'mute'
  | 'dpad-up' | 'dpad-down' | 'dpad-left' | 'dpad-right';

const CONTROLLER_BUTTONS: ReadonlySet<string> = new Set([
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3',
  'create', 'options', 'ps', 'touchpad', 'mute',
  'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right'
]);

export function isControllerButton(value: unknown): value is ControllerButton {
  return typeof value === 'string' && CONTROLLER_BUTTONS.has(value);
}
