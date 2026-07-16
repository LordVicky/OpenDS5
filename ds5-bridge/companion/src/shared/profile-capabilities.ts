// Renders what a profile actually does, derived from the profile itself rather
// than from author-written prose, so a library card can never claim an effect the
// profile does not have. Vendored into the OpenDS5-Profiles repo (see
// scripts/sync-validator.mjs), whose CI bakes the line into index.json on merge --
// the app then describes a profile without downloading it.
import type { TriggerEffectMode } from './protocol';
import type { TriggerProfile, TriggerSlotConfig } from './trigger-profiles';

const EFFECT_LABELS: Record<TriggerEffectMode, string> = {
  off: '',
  feedback: 'feedback',
  weapon: 'weapon',
  vibration: 'vibration',
  'multi-feedback': 'multi-zone',
  slope: 'slope',
  'multi-vibration': 'multi-zone vibration'
};

function slotLabel(name: string, slot: TriggerSlotConfig): string | null {
  const base = slot.base;
  if (!base || base.mode === 'off') return null;
  const label = EFFECT_LABELS[base.mode];
  return label ? `${name} ${label}` : null;
}

export function describeCapabilities(profile: TriggerProfile): string {
  // Multi-state profiles describe their state machinery; the per-slot labels
  // below would only reflect states[0], which undersells what they carry.
  if (profile.states && profile.states.length > 1) {
    const parts = [`${profile.states.length} states`];
    if (profile.switching?.stickWheel) parts.push('analog wheel');
    const rules = profile.switching?.rules.length ?? 0;
    if (rules > 0) parts.push(`${rules} switch ${rules === 1 ? 'rule' : 'rules'}`);
    const modifiers = profile.states.reduce(
      (sum, state) => sum + state.triggers.l2.modifiers.length + state.triggers.r2.modifiers.length,
      0
    );
    if (modifiers > 0) parts.push(`${modifiers} ${modifiers === 1 ? 'modifier' : 'modifiers'}`);
    return parts.join(' · ');
  }

  const { l2, r2 } = profile.triggers;
  const parts = [slotLabel('L2', l2), slotLabel('R2', r2)].filter((part): part is string => part !== null);

  const modifiers = l2.modifiers.length + r2.modifiers.length;
  if (modifiers > 0) {
    parts.push(`${modifiers} ${modifiers === 1 ? 'modifier' : 'modifiers'}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'No trigger effects';
}
