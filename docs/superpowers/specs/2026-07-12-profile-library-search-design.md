# Profile Library: search-first browsing, status tiers, derived descriptions

Date: 2026-07-12
Status: approved (design)

## Problem

The profile library modal renders every profile as a flat list. Three things are wrong with it:

1. **It does not scale.** The user must scroll the entire library to find a game. With
   the library expected to grow, browsing is the wrong primary interaction — searching is.
2. **It cannot express support status.** A `LibraryEntry` is `{ file, name, game, author,
   description }`. There is nowhere to say that a game already drives its own triggers and
   needs no profile, nor whether a profile has been hardware-tested.
3. **Descriptions are free text.** Each author writes prose in whatever shape they like, so
   profiles cannot be compared, and the text can claim things the profile does not do.

## Approach

Search filters the existing list in place. No autocomplete dropdown, no single-result view —
the list stays browsable, and the search box narrows it. This was chosen over an autocomplete
dropdown and a one-game-one-card layout because it is the smallest change that solves the
scrolling problem, and it keeps the whole library reachable when the box is empty.

## Card states

Four states. The first three are data-driven; the fourth is the absence of data.

| State | Source | Install button |
|---|---|---|
| **Native** | `native.json` | No — nothing to install |
| **Verified** | `index.json`, `meta.tier: "verified"` | Yes |
| **Community** | `index.json`, `meta.tier: "community"` | Yes |
| **No profile yet** | game in neither list | No — offers Trigger Lab |

"Native" means the game drives the adaptive triggers itself and OpenDS5 passes through.
It is a property of the *game*, not of a profile, which is why it lives in a separate file
and not as a tier.

## Data model

### `meta.tier`

```ts
tier?: 'verified' | 'community';
```

Added to `TriggerProfileMeta`. Optional, and **absent means `community`** — an unlabelled
profile must never over-claim verification. `verified` means the maintainer has hardware-tested
it; `community` means submitted but not hardware-tested. The axis is verification, not
authorship: a maintainer-written profile that was never tested is `community`.

### `meta.origin`

```ts
origin?: { kind: 'port'; from: string };
```

Optional. Absent means an OpenDS5-built profile. Present means the profile was ported from an
existing game mod (e.g. a Cyberpunk 2077 DualSense mod), and the card renders
`Ported from <from>` in place of the author line.

`origin` is **independent of `tier`** — a port can be verified or community. Ports are expected
to be richer than hand-built profiles, but that richness is expressed through the derived
capability line (below), not through a separate tag.

### `native.json`

New file in the public mirror, published beside `index.json`:

```json
[
  { "game": "Elden Ring", "matches": { "processNames": ["eldenring.exe"] } }
]
```

Fetched by the app alongside the index. Curated by the maintainer; expected to be seeded with a
reasonable number of titles so search feels populated from day one.

## Derived capability line

Author-written descriptions are reduced to **one sentence of intent**. Everything factual about
what the profile *does* is derived from the profile JSON.

```ts
// src/shared/trigger-profiles.ts (or a sibling module)
export function describeCapabilities(profile: TriggerProfile): string;
```

A pure function over `profile.triggers`. It reports:

- which slots have a `base` effect (L2, R2, or both),
- each base's effect type (multi-zone feedback, slope, vibration, …),
- the count and kind of `modifiers` (input-reactive, audio-reactive).

Rendering: `L2 multi-zone · R2 slope · 2 modifiers`

It is pure and shared so that:

- the app renders it without downloading each profile, and
- `scripts/build-index.mjs` bakes it into `index.json` at publish time using the same code the
  app would use — the line cannot drift from the profile.

**Forward compatibility.** When `TriggerSlotConfig` gains weapon variants, `describeCapabilities`
grows to report them (`12 weapon variants · per-weapon recoil`). Ported mods then advertise their
extra richness automatically, with no new tag, no schema churn in the library, and no rewritten
prose. This is the main reason descriptions are derived rather than authored.

## Index shape

`index.json` gains the derived line and the two new fields:

```json
{
  "file": "cyberpunk-2077.json",
  "name": "Weapon-Aware Triggers",
  "game": "Cyberpunk 2077",
  "author": "LordVicky",
  "description": "Full weapon-aware trigger port.",
  "capabilities": "L2+R2 · 12 weapon variants · per-weapon recoil",
  "tier": "verified",
  "origin": { "kind": "port", "from": "DualSensity" }
}
```

`LibraryEntry` and its validator in `profile-library.ts` are extended to match. Unknown or missing
`tier` coerces to `community`; a malformed `origin` is dropped rather than failing the entry, so a
bad field never removes a profile from the library.

## UI

Search input at the top of the modal, filtering on game, profile name, and author. The filter is
client-side over the already-fetched catalog — no network per keystroke.

**Empty query** shows a short default view, not the entire library, so the modal never opens onto
a wall of scroll.

Each row renders:

- game name (eyebrow),
- profile name, then either `by <author>` or `Ported from <origin.from>`,
- the author's one-sentence blurb,
- the derived capability line,
- a status pill (Verified / Community / Native),
- Install — except Native rows, which have no button.

Empty search results show the "no profile yet" state for the typed game, offering Trigger Lab
rather than a bare "no results".

## Error handling

Unchanged in shape from today: a failed fetch falls back to the on-disk cache and surfaces the
error; no cache means an empty catalog with the error shown. `native.json` failing to load
degrades gracefully — native games simply do not get their tag, and the rest of the library still
works. The library must never fail closed because of the *new* file.

## Testing

- `describeCapabilities` — unit tests over each effect type, both slots, modifier counts, and the
  empty profile. This is a pure function and is the highest-value thing to test.
- `LibraryEntry` validation — missing `tier` coerces to `community`; malformed `origin` is dropped
  without dropping the entry; oversized/garbage fields still rejected.
- Search filtering — matches on game, name, and author; empty query shows the default view.
- `build-index.mjs --check` — still gates that `index.json` is in sync, now including the derived
  `capabilities` line, so a stale line fails CI.
- Existing `profile-library.test.ts` cases must continue to pass.

## Out of scope

- Installed-game detection as a suggestion source (considered; deferred).
- Autocomplete dropdown (option A) and single-game card (option C).
- Weapon-variant schema itself — this design only ensures the library surfaces it when it lands.
- Any expansion of the tier list beyond `verified` / `community`.
