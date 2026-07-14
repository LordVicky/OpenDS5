/**
 * A library card leads with the game name. The line under it carries the profile's own name --
 * which is only worth showing when it says something the game name does not, e.g. one of several
 * tunes for the same game ("Cyberpunk 2077 (Heavy)"), or the showcase profile ("Showcase", which
 * targets no particular game).
 *
 * The app exports a profile whose name defaults to the game, so on a contributed profile the two
 * are usually the same string and the card would print the game twice. They also differ in
 * incidental ways -- case and punctuation drift between what the author typed in the app and what
 * they wrote in meta.game -- so compare on letters and digits alone.
 *
 * Returns the label to show, or null when it would only repeat the heading.
 */
export function profileVariantLabel(game: string, name: string): string | null {
  if (!game.trim() || !name.trim()) return null;
  return normalize(game) === normalize(name) ? null : name;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
