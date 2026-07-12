// Renders what a profile actually does, derived from the profile itself rather
// than from author-written prose, so a library card can never claim an effect the
// profile does not have. Shared with scripts/build-index.mjs, which bakes the line
// into index.json at publish time -- the app then describes a profile without
// downloading it.
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
  const { l2, r2 } = profile.triggers;
  const parts = [slotLabel('L2', l2), slotLabel('R2', r2)].filter((part): part is string => part !== null);

  const modifiers = l2.modifiers.length + r2.modifiers.length;
  if (modifiers > 0) {
    parts.push(`${modifiers} ${modifiers === 1 ? 'modifier' : 'modifiers'}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'No trigger effects';
}
