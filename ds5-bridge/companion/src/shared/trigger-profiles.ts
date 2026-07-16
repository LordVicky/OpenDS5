import type { AdaptiveTriggerEffectV2, TriggerEffectMode } from './protocol';

export type { TriggerEffectMode } from './protocol';

export type TriggerEffectSpec = AdaptiveTriggerEffectV2;

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

export interface TriggerSlotPair {
  l2: TriggerSlotConfig;
  r2: TriggerSlotConfig;
}

// A named per-trigger effect set. When a profile carries states, the active
// state's triggers replace the profile-level `triggers` at runtime.
export interface TriggerStateDef {
  name: string;
  triggers: TriggerSlotPair;
}

export type StateSwitchAction = 'cycle' | 'select';

// Maps a controller button press to a state change. `while` names a second
// button that must be held for the rule to fire (chord-style rules).
export interface StateSwitchRule {
  button: string;
  action: StateSwitchAction;
  state?: string;
  while?: string;
}

// Mirrors an in-game analog weapon wheel: while `button` is held, the left
// stick's sector is tracked; releasing the button commits that sector's state.
// `sectors` runs clockwise from 12 o'clock after `angleOffsetDeg` rotation;
// null entries are unassigned slots.
export interface StickWheelConfig {
  button: string;
  thresholdPercent: number;
  angleOffsetDeg: number;
  sectors: (string | null)[];
  // Per-sector angular widths in degrees, matching `sectors` by index and
  // summing to 360. Absent = equal slices. Games draw wheels with unequal
  // slots, so the mapping must be able to match them.
  sectorSpansDeg?: number[];
}

export const MIN_WHEEL_SECTOR_SPAN_DEG = 10;

export interface StateSwitching {
  defaultState?: string;
  rules: StateSwitchRule[];
  stickWheel?: StickWheelConfig;
  // Buttons that toggle the menu guard: while the guard is up, switch rules
  // are ignored so menu navigation can't corrupt the tracked state.
  menuButtons?: string[];
  // Releases the menu guard this long after it was raised; games close menus
  // in ways we can't observe, so the guard must never wedge shut. 0/absent = never.
  menuTimeoutMs?: number;
}

// The buttons the evdev reader reports. Switch rules validate against this
// list (so the rule editor can be a dropdown); the button-held modifier keeps
// accepting free text.
export const KNOWN_BUTTONS = [
  'cross',
  'circle',
  'triangle',
  'square',
  'l1',
  'r1',
  'l3',
  'r3',
  'create',
  'options',
  'ps',
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right'
] as const;

export const MAX_STATES_PER_PROFILE = 12;
export const MIN_WHEEL_SECTORS = 2;
export const MAX_WHEEL_SECTORS = 12;
export const MAX_SWITCH_RULES = 16;
export const MAX_STATE_NAME_LENGTH = 32;

export interface ProfileMatch {
  processNames: string[];
  windowTitles: string[];
}

// A profile with no tier is community: an unlabelled profile must never present
// itself as maintainer-verified.
export type ProfileTier = 'verified' | 'community';

// Set when the profile was ported from an existing game mod rather than built in
// OpenDS5. Independent of tier -- a port can be verified or community.
export interface ProfileOrigin {
  kind: 'port';
  from: string;
}

export interface TriggerProfileMeta {
  game?: string;
  author?: string;
  description?: string;
  source?: 'library' | 'import';
  tier?: ProfileTier;
  origin?: ProfileOrigin;
  // The library file this profile was installed from. Set on install; it is what lets the
  // library know the profile is already installed, and lets the editor reset it back to the
  // published version.
  libraryFile?: string;
}

export interface TriggerProfile {
  version: 1;
  id: string;
  name: string;
  match: ProfileMatch;
  // Mirrors states[0].triggers whenever states exist (editor-maintained), so
  // consumers that predate states keep seeing the profile's default feel.
  triggers: TriggerSlotPair;
  states?: TriggerStateDef[];
  switching?: StateSwitching;
  updatedAtMs: number;
  meta?: TriggerProfileMeta;
}

export interface EngineStatus {
  enabled: boolean;
  suspended: boolean;
  activeProfileId: string;
  matchedBy: 'pin' | 'process' | 'default';
  matchedName: string | null;
  // Name of the profile's active state; null when the profile has no states.
  activeStateName: string | null;
}

export const DEFAULT_PROFILE_ID = 'default';

const PROFILE_KEYS = ['version', 'id', 'name', 'match', 'triggers', 'states', 'switching', 'updatedAtMs', 'meta'];
const META_STRING_KEYS = ['game', 'author', 'description'] as const;
const META_MAX_LENGTH = 500;
// Mirrors the library's own file-name rule; meta.libraryFile becomes part of a fetch URL.
const LIBRARY_FILE_PATTERN = /^[a-z0-9-]+\.json$/;
const ZONE_COUNT = 10;
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

function isPercentInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

type EffectResult = { ok: true; effect: TriggerEffectSpec } | { ok: false; error: string };

// Per-arm allowed keys. Legacy 4-field objects carry `wallPercent` on feedback
// and vibration too; those are tolerated on input and dropped on normalization.
const ALLOWED_EFFECT_KEYS: Record<TriggerEffectMode, string[]> = {
  off: ['mode'],
  feedback: ['mode', 'startPercent', 'forcePercent', 'wallPercent'],
  weapon: ['mode', 'startPercent', 'wallPercent', 'forcePercent'],
  vibration: ['mode', 'startPercent', 'forcePercent', 'frequencyHz', 'wallPercent'],
  'multi-feedback': ['mode', 'zones'],
  slope: ['mode', 'startPercent', 'endPercent', 'startForcePercent', 'endForcePercent'],
  'multi-vibration': ['mode', 'frequencyHz', 'zones']
};

function checkExtraKeys(raw: Record<string, unknown>, mode: TriggerEffectMode, path: string): string | null {
  const allowed = ALLOWED_EFFECT_KEYS[mode];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) return `${path}.${key} is not allowed for mode ${mode}`;
  }
  return null;
}

function validateZones(value: unknown, path: string): string | null {
  if (!Array.isArray(value) || value.length !== ZONE_COUNT || !value.every((entry) => isPercentInt(entry))) {
    return `${path}.zones must be ${ZONE_COUNT} integers 0-100`;
  }
  return null;
}

function validateFrequency(value: unknown, path: string): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 255) {
    return `${path}.frequencyHz must be an integer 1-255`;
  }
  return null;
}

function validateEffectSpec(raw: unknown, path: string): EffectResult {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  const mode = raw.mode;
  switch (mode) {
    case 'off': {
      const extra = checkExtraKeys(raw, 'off', path);
      if (extra) return { ok: false, error: extra };
      return { ok: true, effect: { mode: 'off' } };
    }
    case 'feedback': {
      const extra = checkExtraKeys(raw, 'feedback', path);
      if (extra) return { ok: false, error: extra };
      for (const key of ['startPercent', 'forcePercent'] as const) {
        if (!isPercentInt(raw[key])) return { ok: false, error: `${path}.${key} must be an integer 0-100` };
      }
      return { ok: true, effect: { mode: 'feedback', startPercent: raw.startPercent as number, forcePercent: raw.forcePercent as number } };
    }
    case 'weapon': {
      const extra = checkExtraKeys(raw, 'weapon', path);
      if (extra) return { ok: false, error: extra };
      for (const key of ['startPercent', 'wallPercent', 'forcePercent'] as const) {
        if (!isPercentInt(raw[key])) return { ok: false, error: `${path}.${key} must be an integer 0-100` };
      }
      return {
        ok: true,
        effect: {
          mode: 'weapon',
          startPercent: raw.startPercent as number,
          wallPercent: raw.wallPercent as number,
          forcePercent: raw.forcePercent as number
        }
      };
    }
    case 'vibration': {
      const extra = checkExtraKeys(raw, 'vibration', path);
      if (extra) return { ok: false, error: extra };
      for (const key of ['startPercent', 'forcePercent'] as const) {
        if (!isPercentInt(raw[key])) return { ok: false, error: `${path}.${key} must be an integer 0-100` };
      }
      const effect: TriggerEffectSpec = { mode: 'vibration', startPercent: raw.startPercent as number, forcePercent: raw.forcePercent as number };
      if (raw.frequencyHz !== undefined) {
        const freqError = validateFrequency(raw.frequencyHz, path);
        if (freqError) return { ok: false, error: freqError };
        effect.frequencyHz = raw.frequencyHz as number;
      }
      return { ok: true, effect };
    }
    case 'multi-feedback': {
      const extra = checkExtraKeys(raw, 'multi-feedback', path);
      if (extra) return { ok: false, error: extra };
      const zonesError = validateZones(raw.zones, path);
      if (zonesError) return { ok: false, error: zonesError };
      return { ok: true, effect: { mode: 'multi-feedback', zones: [...(raw.zones as number[])] } };
    }
    case 'slope': {
      const extra = checkExtraKeys(raw, 'slope', path);
      if (extra) return { ok: false, error: extra };
      for (const key of ['startPercent', 'endPercent', 'startForcePercent', 'endForcePercent'] as const) {
        if (!isPercentInt(raw[key])) return { ok: false, error: `${path}.${key} must be an integer 0-100` };
      }
      if ((raw.endPercent as number) <= (raw.startPercent as number)) {
        return { ok: false, error: `${path}.endPercent must be greater than startPercent` };
      }
      return {
        ok: true,
        effect: {
          mode: 'slope',
          startPercent: raw.startPercent as number,
          endPercent: raw.endPercent as number,
          startForcePercent: raw.startForcePercent as number,
          endForcePercent: raw.endForcePercent as number
        }
      };
    }
    case 'multi-vibration': {
      const extra = checkExtraKeys(raw, 'multi-vibration', path);
      if (extra) return { ok: false, error: extra };
      const freqError = validateFrequency(raw.frequencyHz, path);
      if (freqError) return { ok: false, error: freqError };
      const zonesError = validateZones(raw.zones, path);
      if (zonesError) return { ok: false, error: zonesError };
      return { ok: true, effect: { mode: 'multi-vibration', frequencyHz: raw.frequencyHz as number, zones: [...(raw.zones as number[])] } };
    }
    default:
      return { ok: false, error: `${path}.mode is not a valid effect mode: ${String(mode)}` };
  }
}

type ModifierResult = { ok: true; modifier: TriggerModifier } | { ok: false; error: string };

function validateModifier(raw: unknown, path: string): ModifierResult {
  if (!isRecord(raw) || !isRecord(raw.when)) return { ok: false, error: `${path}.when must be an object` };
  const when = raw.when;
  if (when.source !== 'input' && when.source !== 'audio') return { ok: false, error: `${path}.when.source is invalid` };
  if (when.source === 'input' && !INPUT_CONDITIONS.includes(when.condition as InputConditionType)) {
    return { ok: false, error: `${path}.when.condition is not a known input condition` };
  }
  const effect = validateEffectSpec(raw.effect, `${path}.effect`);
  if (!effect.ok) return effect;
  return { ok: true, modifier: { when: when as unknown as ModifierCondition, effect: effect.effect } };
}

type SlotResult = { ok: true; slot: TriggerSlotConfig } | { ok: false; error: string };

function validateSlot(raw: unknown, path: string): SlotResult {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  let base: TriggerEffectSpec | null = null;
  if (raw.base !== null) {
    const result = validateEffectSpec(raw.base, `${path}.base`);
    if (!result.ok) return result;
    base = result.effect;
  }
  if (!Array.isArray(raw.modifiers)) return { ok: false, error: `${path}.modifiers must be an array` };
  const modifiers: TriggerModifier[] = [];
  for (let index = 0; index < raw.modifiers.length; index += 1) {
    const result = validateModifier(raw.modifiers[index], `${path}.modifiers[${index}]`);
    if (!result.ok) return result;
    modifiers.push(result.modifier);
  }
  return { ok: true, slot: { base, modifiers } };
}

type SlotPairResult = { ok: true; triggers: TriggerSlotPair } | { ok: false; error: string };

function validateSlotPair(raw: unknown, path: string): SlotPairResult {
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  for (const key of Object.keys(raw)) {
    if (key !== 'l2' && key !== 'r2') return { ok: false, error: `${path}.${key} is not a trigger slot` };
  }
  const pair: TriggerSlotPair = {
    l2: { base: null, modifiers: [] },
    r2: { base: null, modifiers: [] }
  };
  for (const slot of ['l2', 'r2'] as const) {
    const result = validateSlot(raw[slot], `${path}.${slot}`);
    if (!result.ok) return result;
    pair[slot] = result.slot;
  }
  return { ok: true, triggers: pair };
}

type StatesResult = { ok: true; states: TriggerStateDef[] } | { ok: false; error: string };

function validateStates(raw: unknown): StatesResult {
  if (!Array.isArray(raw)) return { ok: false, error: 'states must be an array' };
  if (raw.length === 0) return { ok: false, error: 'states must not be empty' };
  if (raw.length > MAX_STATES_PER_PROFILE) {
    return { ok: false, error: `states must have at most ${MAX_STATES_PER_PROFILE} entries` };
  }
  const states: TriggerStateDef[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const path = `states[${index}]`;
    const entry = raw[index];
    if (!isRecord(entry)) return { ok: false, error: `${path} must be an object` };
    for (const key of Object.keys(entry)) {
      if (key !== 'name' && key !== 'triggers') return { ok: false, error: `${path}.${key} is not an allowed state field` };
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0 || entry.name.length > MAX_STATE_NAME_LENGTH) {
      return { ok: false, error: `${path}.name must be a string of 1-${MAX_STATE_NAME_LENGTH} characters` };
    }
    if (seen.has(entry.name)) return { ok: false, error: `${path}.name duplicates state name: ${entry.name}` };
    seen.add(entry.name);
    const triggers = validateSlotPair(entry.triggers, `${path}.triggers`);
    if (!triggers.ok) return triggers;
    states.push({ name: entry.name, triggers: triggers.triggers });
  }
  return { ok: true, states };
}

type SwitchingResult = { ok: true; switching: StateSwitching } | { ok: false; error: string };

function isKnownButton(value: unknown): value is string {
  return typeof value === 'string' && (KNOWN_BUTTONS as readonly string[]).includes(value);
}

function validateSwitching(raw: unknown, stateNames: ReadonlySet<string>): SwitchingResult {
  if (!isRecord(raw)) return { ok: false, error: 'switching must be an object' };
  for (const key of Object.keys(raw)) {
    if (!['defaultState', 'rules', 'menuButtons', 'menuTimeoutMs', 'stickWheel'].includes(key)) {
      return { ok: false, error: `switching.${key} is not an allowed switching field` };
    }
  }
  const switching: StateSwitching = { rules: [] };
  if (raw.defaultState !== undefined) {
    if (typeof raw.defaultState !== 'string' || !stateNames.has(raw.defaultState)) {
      return { ok: false, error: 'switching.defaultState must name an existing state' };
    }
    switching.defaultState = raw.defaultState;
  }
  if (!Array.isArray(raw.rules)) return { ok: false, error: 'switching.rules must be an array' };
  if (raw.rules.length > MAX_SWITCH_RULES) {
    return { ok: false, error: `switching.rules must have at most ${MAX_SWITCH_RULES} entries` };
  }
  for (let index = 0; index < raw.rules.length; index += 1) {
    const path = `switching.rules[${index}]`;
    const entry = raw.rules[index];
    if (!isRecord(entry)) return { ok: false, error: `${path} must be an object` };
    for (const key of Object.keys(entry)) {
      if (!['button', 'action', 'state', 'while'].includes(key)) {
        return { ok: false, error: `${path}.${key} is not an allowed rule field` };
      }
    }
    if (!isKnownButton(entry.button)) return { ok: false, error: `${path}.button must be a known button` };
    if (entry.action !== 'cycle' && entry.action !== 'select') {
      return { ok: false, error: `${path}.action must be 'cycle' or 'select'` };
    }
    const rule: StateSwitchRule = { button: entry.button, action: entry.action };
    if (entry.action === 'select') {
      if (typeof entry.state !== 'string' || !stateNames.has(entry.state)) {
        return { ok: false, error: `${path}.state must name an existing state` };
      }
      rule.state = entry.state;
    } else if (entry.state !== undefined) {
      return { ok: false, error: `${path}.state is only allowed for select rules` };
    }
    if (entry.while !== undefined) {
      if (!isKnownButton(entry.while)) return { ok: false, error: `${path}.while must be a known button` };
      rule.while = entry.while;
    }
    switching.rules.push(rule);
  }
  if (raw.menuButtons !== undefined) {
    if (!Array.isArray(raw.menuButtons) || !raw.menuButtons.every((entry) => isKnownButton(entry))) {
      return { ok: false, error: 'switching.menuButtons must be an array of known buttons' };
    }
    switching.menuButtons = [...(raw.menuButtons as string[])];
  }
  if (raw.menuTimeoutMs !== undefined) {
    if (typeof raw.menuTimeoutMs !== 'number' || !Number.isInteger(raw.menuTimeoutMs) || raw.menuTimeoutMs < 0) {
      return { ok: false, error: 'switching.menuTimeoutMs must be a non-negative integer' };
    }
    switching.menuTimeoutMs = raw.menuTimeoutMs;
  }
  if (raw.stickWheel !== undefined) {
    const wheelResult = validateStickWheel(raw.stickWheel, stateNames);
    if (!wheelResult.ok) return wheelResult;
    if (switching.menuButtons?.includes(wheelResult.wheel.button)) {
      return { ok: false, error: 'switching.stickWheel.button must not also appear in menuButtons' };
    }
    switching.stickWheel = wheelResult.wheel;
  }
  return { ok: true, switching };
}

type StickWheelResult = { ok: true; wheel: StickWheelConfig } | { ok: false; error: string };

function validateStickWheel(raw: unknown, stateNames: ReadonlySet<string>): StickWheelResult {
  const path = 'switching.stickWheel';
  if (!isRecord(raw)) return { ok: false, error: `${path} must be an object` };
  for (const key of Object.keys(raw)) {
    if (!['button', 'thresholdPercent', 'angleOffsetDeg', 'sectors', 'sectorSpansDeg'].includes(key)) {
      return { ok: false, error: `${path}.${key} is not an allowed stickWheel field` };
    }
  }
  if (!isKnownButton(raw.button)) return { ok: false, error: `${path}.button must be a known button` };
  if (
    typeof raw.thresholdPercent !== 'number' ||
    !Number.isInteger(raw.thresholdPercent) ||
    raw.thresholdPercent < 1 ||
    raw.thresholdPercent > 100
  ) {
    return { ok: false, error: `${path}.thresholdPercent must be an integer 1-100` };
  }
  if (
    typeof raw.angleOffsetDeg !== 'number' ||
    !Number.isInteger(raw.angleOffsetDeg) ||
    raw.angleOffsetDeg < 0 ||
    raw.angleOffsetDeg > 359
  ) {
    return { ok: false, error: `${path}.angleOffsetDeg must be an integer 0-359` };
  }
  if (
    !Array.isArray(raw.sectors) ||
    raw.sectors.length < MIN_WHEEL_SECTORS ||
    raw.sectors.length > MAX_WHEEL_SECTORS
  ) {
    return { ok: false, error: `${path}.sectors must have ${MIN_WHEEL_SECTORS}-${MAX_WHEEL_SECTORS} entries` };
  }
  for (let index = 0; index < raw.sectors.length; index += 1) {
    const entry = raw.sectors[index];
    if (entry === null) continue;
    if (typeof entry !== 'string' || !stateNames.has(entry)) {
      return { ok: false, error: `${path}.sectors[${index}] must be null or name an existing state` };
    }
  }
  let sectorSpansDeg: number[] | undefined;
  if (raw.sectorSpansDeg !== undefined) {
    if (
      !Array.isArray(raw.sectorSpansDeg) ||
      raw.sectorSpansDeg.length !== raw.sectors.length ||
      !raw.sectorSpansDeg.every(
        (entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= MIN_WHEEL_SECTOR_SPAN_DEG
      )
    ) {
      return {
        ok: false,
        error: `${path}.sectorSpansDeg must match sectors in length with integer entries of at least ${MIN_WHEEL_SECTOR_SPAN_DEG} degrees`
      };
    }
    const total = (raw.sectorSpansDeg as number[]).reduce((sum, entry) => sum + entry, 0);
    if (total !== 360) {
      return { ok: false, error: `${path}.sectorSpansDeg must sum to 360 degrees` };
    }
    sectorSpansDeg = [...(raw.sectorSpansDeg as number[])];
  }
  return {
    ok: true,
    wheel: {
      button: raw.button,
      thresholdPercent: raw.thresholdPercent,
      angleOffsetDeg: raw.angleOffsetDeg,
      sectors: [...(raw.sectors as (string | null)[])],
      ...(sectorSpansDeg ? { sectorSpansDeg } : {})
    }
  };
}

type MetaResult = { ok: true; meta: TriggerProfileMeta } | { ok: false; error: string };

function validateMeta(raw: unknown): MetaResult {
  if (!isRecord(raw)) return { ok: false, error: 'meta must be an object' };
  const allowed = [...META_STRING_KEYS, 'source', 'tier', 'origin', 'libraryFile'];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) return { ok: false, error: `meta.${key} is not an allowed meta field` };
  }
  const meta: TriggerProfileMeta = {};
  for (const key of META_STRING_KEYS) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'string') return { ok: false, error: `meta.${key} must be a string` };
    if ((raw[key] as string).length > META_MAX_LENGTH) {
      return { ok: false, error: `meta.${key} must be at most ${META_MAX_LENGTH} characters` };
    }
    meta[key] = raw[key] as string;
  }
  if (raw.source !== undefined) {
    if (raw.source !== 'library' && raw.source !== 'import') {
      return { ok: false, error: "meta.source must be 'library' or 'import'" };
    }
    meta.source = raw.source;
  }
  if (raw.tier !== undefined) {
    if (raw.tier !== 'verified' && raw.tier !== 'community') {
      return { ok: false, error: "meta.tier must be 'verified' or 'community'" };
    }
    meta.tier = raw.tier;
  }
  if (raw.origin !== undefined) {
    const origin = raw.origin;
    if (!isRecord(origin)) return { ok: false, error: 'meta.origin must be an object' };
    for (const key of Object.keys(origin)) {
      if (key !== 'kind' && key !== 'from') {
        return { ok: false, error: `meta.origin.${key} is not an allowed origin field` };
      }
    }
    if (origin.kind !== 'port') return { ok: false, error: "meta.origin.kind must be 'port'" };
    if (typeof origin.from !== 'string' || origin.from.length === 0) {
      return { ok: false, error: 'meta.origin.from must be a non-empty string' };
    }
    if (origin.from.length > META_MAX_LENGTH) {
      return { ok: false, error: `meta.origin.from must be at most ${META_MAX_LENGTH} characters` };
    }
    meta.origin = { kind: 'port', from: origin.from };
  }
  if (raw.libraryFile !== undefined) {
    // This name is interpolated into the library URL when a profile is reset, so it must be
    // a bare safe file name -- never a path.
    if (typeof raw.libraryFile !== 'string' || !LIBRARY_FILE_PATTERN.test(raw.libraryFile)) {
      return { ok: false, error: 'meta.libraryFile must be a library file name like my-game.json' };
    }
    meta.libraryFile = raw.libraryFile;
  }
  return { ok: true, meta };
}

export function slugifyTriggerProfileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function uniqueTriggerProfileId(name: string, existingIds: readonly string[]): string {
  const base = slugifyTriggerProfileName(name);
  const taken = new Set(existingIds);
  const isTaken = (candidate: string) => candidate === 'default' || candidate === '' || taken.has(candidate);
  if (!isTaken(base)) {
    return base;
  }
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (isTaken(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
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
  const slots: { l2: TriggerSlotConfig; r2: TriggerSlotConfig } = {
    l2: { base: null, modifiers: [] },
    r2: { base: null, modifiers: [] }
  };
  for (const slot of ['l2', 'r2'] as const) {
    const result = validateSlot(raw.triggers[slot], `triggers.${slot}`);
    if (!result.ok) return fail(result.error);
    slots[slot] = result.slot;
  }
  let states: TriggerStateDef[] | undefined;
  if (raw.states !== undefined) {
    const statesResult = validateStates(raw.states);
    if (!statesResult.ok) return fail(statesResult.error);
    states = statesResult.states;
  }
  let switching: StateSwitching | undefined;
  if (raw.switching !== undefined) {
    if (!states) return fail('switching requires states');
    const switchingResult = validateSwitching(raw.switching, new Set(states.map((state) => state.name)));
    if (!switchingResult.ok) return fail(switchingResult.error);
    switching = switchingResult.switching;
  }
  if (typeof raw.updatedAtMs !== 'number') return fail('updatedAtMs must be a number');
  let meta: TriggerProfileMeta | undefined;
  if (raw.meta !== undefined) {
    const metaResult = validateMeta(raw.meta);
    if (!metaResult.ok) return fail(metaResult.error);
    meta = metaResult.meta;
  }
  return {
    ok: true,
    profile: {
      version: 1,
      id: raw.id,
      name: raw.name,
      match: {
        processNames: [...raw.match.processNames],
        windowTitles: [...raw.match.windowTitles]
      },
      triggers: slots,
      ...(states ? { states } : {}),
      ...(switching ? { switching } : {}),
      updatedAtMs: raw.updatedAtMs,
      ...(meta ? { meta } : {})
    }
  };
}

/**
 * The profile's runtime state list: the declared states, or the profile-level
 * triggers as a single anonymous state for profiles that predate states.
 */
export function profileStateList(profile: TriggerProfile): TriggerStateDef[] {
  if (profile.states && profile.states.length > 0) return profile.states;
  return [{ name: '', triggers: profile.triggers }];
}

export function defaultStateIndex(profile: TriggerProfile): number {
  const name = profile.switching?.defaultState;
  if (!name || !profile.states) return 0;
  const index = profile.states.findIndex((state) => state.name === name);
  return index >= 0 ? index : 0;
}

export function effectSpecEquals(a: TriggerEffectSpec | null, b: TriggerEffectSpec | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.mode !== b.mode) return false;
  switch (a.mode) {
    case 'off':
      return true;
    case 'feedback': {
      const y = b as Extract<TriggerEffectSpec, { mode: 'feedback' }>;
      return a.startPercent === y.startPercent && a.forcePercent === y.forcePercent;
    }
    case 'weapon': {
      const y = b as Extract<TriggerEffectSpec, { mode: 'weapon' }>;
      return a.startPercent === y.startPercent && a.wallPercent === y.wallPercent && a.forcePercent === y.forcePercent;
    }
    case 'vibration': {
      const y = b as Extract<TriggerEffectSpec, { mode: 'vibration' }>;
      return a.startPercent === y.startPercent && a.forcePercent === y.forcePercent && a.frequencyHz === y.frequencyHz;
    }
    case 'multi-feedback': {
      const y = b as Extract<TriggerEffectSpec, { mode: 'multi-feedback' }>;
      return zonesEqual(a.zones, y.zones);
    }
    case 'slope': {
      const y = b as Extract<TriggerEffectSpec, { mode: 'slope' }>;
      return (
        a.startPercent === y.startPercent &&
        a.endPercent === y.endPercent &&
        a.startForcePercent === y.startForcePercent &&
        a.endForcePercent === y.endForcePercent
      );
    }
    case 'multi-vibration': {
      const y = b as Extract<TriggerEffectSpec, { mode: 'multi-vibration' }>;
      return a.frequencyHz === y.frequencyHz && zonesEqual(a.zones, y.zones);
    }
    default:
      return false;
  }
}

function zonesEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export function defaultEffectForMode(mode: TriggerEffectMode): TriggerEffectSpec {
  switch (mode) {
    case 'off':
      return { mode: 'off' };
    case 'feedback':
      return { mode: 'feedback', startPercent: 0, forcePercent: 0 };
    case 'weapon':
      return { mode: 'weapon', startPercent: 0, wallPercent: 0, forcePercent: 0 };
    case 'vibration':
      return { mode: 'vibration', startPercent: 0, forcePercent: 0, frequencyHz: 25 };
    case 'multi-feedback':
      return { mode: 'multi-feedback', zones: [0, 0, 0, 0, 60, 60, 60, 60, 0, 0] };
    case 'slope':
      return { mode: 'slope', startPercent: 20, endPercent: 90, startForcePercent: 10, endForcePercent: 100 };
    case 'multi-vibration':
      return { mode: 'multi-vibration', frequencyHz: 25, zones: [0, 0, 0, 0, 60, 60, 60, 60, 0, 0] };
    default:
      return { mode: 'off' };
  }
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
