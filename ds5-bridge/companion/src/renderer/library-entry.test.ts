import { describe, expect, it } from 'vitest';
import { profileVariantLabel } from './library-entry';

describe('profileVariantLabel', () => {
  // The app exports a profile whose name is just the game, so for a contributed profile the two
  // fields collide and the card printed the game twice.
  it('is null when the profile name is just the game name', () => {
    expect(profileVariantLabel('Stray', 'Stray')).toBeNull();
  });

  // The real case that shipped: meta.game said "NieR", the profile name said "Nier".
  it('ignores case and punctuation when deciding they are the same', () => {
    expect(profileVariantLabel('NieR Replicant', 'Nier Replicant')).toBeNull();
    expect(profileVariantLabel('MOUSE: P.I. For Hire', 'MOUSE P.I. For HIre')).toBeNull();
    expect(profileVariantLabel('Stray', '  stray  ')).toBeNull();
  });

  // What the slot is actually for: telling apart several profiles for the same game.
  it('keeps a name that says something the game name does not', () => {
    expect(profileVariantLabel('Cyberpunk 2077', 'Cyberpunk 2077 (Heavy)')).toBe(
      'Cyberpunk 2077 (Heavy)'
    );
    expect(profileVariantLabel('Any', 'Showcase')).toBe('Showcase');
  });

  it('is null when either field is missing', () => {
    expect(profileVariantLabel('', 'Stray')).toBeNull();
    expect(profileVariantLabel('Stray', '')).toBeNull();
  });
});
