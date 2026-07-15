// Game Profile settings are ordinary controller/button-remap profiles keyed by the
// trigger profile they belong to. The prefix is the whole convention: no separate
// profile model exists. `game:cyberpunk-2077` in controllerProfiles is Cyberpunk's
// game settings; the same id in buttonRemappingProfiles is its button mapping.
//
// These helpers live in their own module rather than protocol.ts on purpose:
// protocol.ts is vendored verbatim into the public OpenDS5-Profiles repo as part of
// the trigger-profile validator (scripts/sync-validator.mjs --check pins it), and
// game settings ids are app plumbing, not part of that validation contract.
export const GAME_SETTINGS_PROFILE_PREFIX = 'game:';

export function gameSettingsProfileId(triggerProfileId: string): string {
  return `${GAME_SETTINGS_PROFILE_PREFIX}${triggerProfileId}`;
}

export function isGameSettingsProfileId(value: string): boolean {
  return value.startsWith(GAME_SETTINGS_PROFILE_PREFIX);
}

export function triggerProfileIdFromGameSettingsId(value: string): string | null {
  return isGameSettingsProfileId(value) ? value.slice(GAME_SETTINGS_PROFILE_PREFIX.length) : null;
}
