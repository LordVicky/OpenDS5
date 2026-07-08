import type { TriggerTestMode } from './protocol';

export interface TriggerEffectSpec {
  mode: TriggerTestMode;
  startPercent: number;
  wallPercent: number;
  forcePercent: number;
}

export type InputConditionType = 'trigger-held-over' | 'trigger-full-pull' | 'button-held' | 'rapid-fire';

export interface ModifierCondition {
  source: 'input' | 'audio';
  condition: InputConditionType | string;
  threshold?: number;
  ms?: number;
  button?: string;
  pressesPerSecond?: number;
}

export interface TriggerModifier {
  when: ModifierCondition;
  effect: TriggerEffectSpec;
}

export interface TriggerSlotConfig {
  base: TriggerEffectSpec | null;
  modifiers: TriggerModifier[];
}

export interface ProfileMatch {
  processNames: string[];
  windowTitles: string[];
}

export interface TriggerProfile {
  version: 1;
  id: string;
  name: string;
  match: ProfileMatch;
  triggers: { l2: TriggerSlotConfig; r2: TriggerSlotConfig };
  updatedAtMs: number;
}

export const DEFAULT_PROFILE_ID = 'default';

const PROFILE_KEYS = ['version', 'id', 'name', 'match', 'triggers', 'updatedAtMs'];
const TRIGGER_MODES: TriggerTestMode[] = ['feedback', 'weapon', 'vibration'];
const INPUT_CONDITIONS: InputConditionType[] = [
  'trigger-held-over',
  'trigger-full-pull',
  'button-held',
  'rapid-fire'
];

type ValidationResult = { ok: true; profile: TriggerProfile } | { ok: false; error: string };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function validateEffect(raw: unknown, path: string): string | null {
  if (!isRecord(raw)) return `${path} must be an object`;
  if (!TRIGGER_MODES.includes(raw.mode as TriggerTestMode)) return `${path}.mode is invalid`;
  for (const key of ['startPercent', 'wallPercent', 'forcePercent'] as const) {
    if (!isPercent(raw[key])) return `${path}.${key} must be 0-100`;
  }
  return null;
}

function validateModifier(raw: unknown, path: string): string | null {
  if (!isRecord(raw) || !isRecord(raw.when)) return `${path}.when must be an object`;
  const when = raw.when;
  if (when.source !== 'input' && when.source !== 'audio') return `${path}.when.source is invalid`;
  if (when.source === 'input' && !INPUT_CONDITIONS.includes(when.condition as InputConditionType)) {
    return `${path}.when.condition is not a known input condition`;
  }
  return validateEffect(raw.effect, `${path}.effect`);
}

function validateSlot(raw: unknown, path: string): string | null {
  if (!isRecord(raw)) return `${path} must be an object`;
  if (raw.base !== null) {
    const error = validateEffect(raw.base, `${path}.base`);
    if (error) return error;
  }
  if (!Array.isArray(raw.modifiers)) return `${path}.modifiers must be an array`;
  for (let index = 0; index < raw.modifiers.length; index += 1) {
    const error = validateModifier(raw.modifiers[index], `${path}.modifiers[${index}]`);
    if (error) return error;
  }
  return null;
}

export function validateTriggerProfile(raw: unknown): ValidationResult {
  if (!isRecord(raw)) return fail('profile must be an object');
  for (const key of Object.keys(raw)) {
    if (!PROFILE_KEYS.includes(key)) return fail(`unknown field: ${key}`);
  }
  if (raw.version !== 1) return fail('unsupported profile version');
  if (typeof raw.id !== 'string' || raw.id.length === 0) return fail('id must be a non-empty string');
  if (typeof raw.name !== 'string' || raw.name.length === 0) return fail('name must be a non-empty string');
  if (!isRecord(raw.match) || !isStringArray(raw.match.processNames) || !isStringArray(raw.match.windowTitles)) {
    return fail('match must contain processNames and windowTitles string arrays');
  }
  if (!isRecord(raw.triggers)) return fail('triggers must be an object');
  for (const slot of ['l2', 'r2'] as const) {
    const error = validateSlot(raw.triggers[slot], `triggers.${slot}`);
    if (error) return fail(error);
  }
  if (typeof raw.updatedAtMs !== 'number') return fail('updatedAtMs must be a number');
  return { ok: true, profile: raw as unknown as TriggerProfile };
}

export function createDefaultProfile(): TriggerProfile {
  return {
    version: 1,
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    match: { processNames: [], windowTitles: [] },
    triggers: {
      l2: { base: null, modifiers: [] },
      r2: { base: null, modifiers: [] }
    },
    updatedAtMs: 0
  };
}
