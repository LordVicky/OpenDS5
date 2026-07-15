# Installed Games Import (Steam + Heroic) — Design

Status: approved
Date: 2026-07-15
Branch: `dev`

## Goal

Let users pull their installed Steam and Heroic Games Launcher games into the Game
Profile tab instead of typing names and hunting for process matches by hand. One
click on a scanned game creates its Game Profile with the name, process match, and
cover art pre-filled — and the existing OpenDS5-Profiles pipeline (published profile
install, native-game flagging) fires exactly as if the user had typed the name.

Linux only, disk only: no Steam Web API, no Epic/GOG login, no network beyond the
artwork fallback the app already has. Installed games are read from the launchers'
own on-disk manifests.

## Non-goals

- **No auto-import.** A user with 200 installed games does not want 200 surprise
  tiles. Scanned games are offered in the Add Game dialog; the user picks.
- **No non-Steam shortcuts, no Proton prefix spelunking.** The existing
  "detect running processes" flow covers oddballs.
- **No ownership lists.** Only *installed* games; owned-but-not-installed is noise.
- **No Windows scanner in v1.** The module boundary keeps a future
  `windows-installed-games.ts` additive.

## Data sources

### Steam

Root discovery, first match wins per root (all are checked; a machine can have
several):

- `~/.steam/steam` (symlink into the default install)
- `~/.local/share/Steam`
- `~/.var/app/com.valvesoftware.Steam/.local/share/Steam` (flatpak)

From a root: `steamapps/libraryfolders.vdf` lists every library folder (other
drives included). Each library's `steamapps/appmanifest_*.acf` is one installed
game: `appid`, `name`, `installdir` (under `<library>/steamapps/common/`). VDF/ACF
is a flat quoted key-value format; we ship a small tolerant parser (~30 lines), no
dependency. Manifests with `StateFlags` missing 4 (fully installed) are skipped.

**Artwork**: `<root>/appcache/librarycache/<appid>_library_600x900.jpg` — Steam's
own portrait cover cache, the exact 600x900 shape the tiles use, available offline.

### Heroic

Config roots:

- `~/.config/heroic`
- `~/.var/app/com.heroicgameslauncher.hgl/config/heroic` (flatpak)

Per store:

- **Epic (legendary)**: `store_cache/legendary_library.json` for metadata (title,
  `art_cover`/`art_square`, `app_name`), cross-referenced with
  `~/.config/legendary/installed.json` (and the flatpak variant) for install path
  and executable.
- **GOG**: `gog_store/installed.json` for install path + `store_cache/gog_library.json`
  for title and art.
- **Sideloaded**: `sideload_apps/library.json` — carries title, executable, and art
  directly.

**Artwork**: the `art_cover` URL from the store cache, downloaded once through the
existing `GameArtworkStore` plumbing (same size/HTTPS guards as the Bottles proxy).

## Scanner module

`src/main/installed-games.ts`:

```ts
export interface InstalledGame {
  source: 'steam' | 'heroic';
  name: string;                    // display name, normalized (™/® stripped)
  sourceId: string;                // steam appid / heroic app_name
  installDir: string | null;
  processCandidates: string[];     // ranked, best first
  artwork:                          // best available, one of:
    | { kind: 'file'; path: string }     // Steam librarycache jpg
    | { kind: 'url'; url: string }       // Heroic art_cover
    | null;                              // fall back to keyless proxy
}

export class InstalledGamesScanner {
  scan(): Promise<InstalledGame[]>;   // reads all roots, merges, dedupes by name
}
```

Everything is injected for tests: root paths and fs access via a `roots` override,
so fixtures are plain temp directories. A scan never throws — an unreadable root or
a malformed manifest is skipped (per-source errors collected on the result for a
diagnostic line in the dialog, mirroring the profile library's `error` field).

### Process-candidate ranking

The install dir is scanned at most 4 levels deep (Unreal ships binaries at Game/Project/Binaries/Win64/) for executables (`.exe` plus ELF
files with the exec bit). Candidates are ranked by score; all are returned in rank
order:

- **+2** basename similarity to the install dir name (`eldenring.exe` in
  `ELDEN RING/`), after lowercasing and stripping spaces/punctuation.
- **+2** largest binary in the tree (game binaries dwarf everything else).
- **-3** name matches the junk list: `unins*`, `*setup*`, `*redist*`, `vcredist*`,
  `dxsetup*`, `crashreport*`, `*cefsubprocess*`, `ue4prereqsetup*`, `dotnet*`.
- **-1** smaller than 4 MB.
- Anti-cheat shims (`start_protected_game.exe`, `*_eac.exe`, `*battleye*`) are kept
  at neutral score — matching the shim *or* the real binary is fine, and covering
  both launch styles is why more than one candidate can stay ticked.

Heroic entries that carry an explicit `executable` put it at rank 0 unconditionally.
For Linux-native games the ELF name is usually exact.

The ranking only has to make the default ticks usually right: the dialog lets the
user untick, and live process detection remains the ground-truth fallback.

## IPC

- `bridge:listInstalledGames` → `{ games: InstalledGame[]; errors: string[] }`.
  Scans on first call, cached for the session; `refresh: true` rescans. Games whose
  normalized name already matches an existing game profile (same rule as
  `matchGameInLibrary`) are filtered out main-side, so the dialog only offers
  new games.

The dialog needs Steam cover files as data URLs; rather than a new file-serving
channel, the scan result inlines a thumbnail data URL for `kind: 'file'` artwork
(read once, ~30 KB each, capped at the existing image size guard).

## Add Game dialog

The dialog gains a "From your libraries" section above the manual name field:

- A compact cover grid (cover, name, Steam/Heroic badge) of scanned games without
  profiles, with a search filter and a refresh button. Empty state names both
  launchers so it reads as intentional ("No Steam or Heroic games found").
- Clicking a game switches the dialog to the confirm step: name pre-filled,
  **process candidates as pre-ticked checkboxes** (rank order, junk-scored ones
  pre-unticked), same Detect button as today.
- Create runs the *existing* `submitGameCreate` pipeline unchanged: the
  OpenDS5-Profiles catalog decides library-profile install vs native flag vs plain
  entry. The only addition: when the scanned game carried artwork, it is applied
  through `GameArtworkStore` *before* falling back to the keyless proxy.
- Manual entry stays exactly as it is for everything not in a launcher.

Bulk import ("select several, Add all") is explicitly deferred — the grid makes
serial adding cheap, and bulk creation would race the artwork fetches and library
installs for little gain. Revisit if users ask.

## Name normalization

Steam names carry marks ("ELDEN RING™", "Marvel's Spider-Man: Miles Morales®").
Before display and DB matching: strip `™®©`, collapse whitespace. The
OpenDS5-Profiles match stays the existing exact normalized-name rule — fuzzy
matching is a separate problem and out of scope.

## Testing

- **VDF/ACF parser**: real-shaped fixtures — multi-library `libraryfolders.vdf`,
  manifests with escaped quotes, partial installs (StateFlags), missing fields.
- **Heroic**: fixture JSON for legendary/GOG/sideload, flatpak root precedence,
  missing installed.json (library present but nothing installed).
- **Ranking**: an Elden Ring-shaped fixture (shim + real exe + vcredist), a
  launcher-first fixture, a Linux-native ELF fixture; asserts order and junk
  penalties.
- **Dedup/filter**: scanner merges the same game found under two roots; IPC filter
  drops games that already have profiles.
- All fixture-based, no real Steam/Heroic install needed; the suite stays green in CI.

## Risks

- **Proton executable quality** is the known soft spot (launchers, anti-cheat
  shims). Mitigated by ranking + user-editable ticks + live detection; not solved,
  deliberately.
- **Heroic schema drift**: store_cache formats are Heroic-internal and can change.
  Parsers are tolerant (skip, never throw) and per-store, so one store breaking
  degrades to "that store's games don't appear", surfaced in the dialog's
  diagnostic line.
- **Very large libraries**: hundreds of manifests are trivial (text files), but the
  executable scan walks install dirs — capped at depth 4 and skipped when a Heroic
  entry names its executable. Scan runs off the IPC call, not at startup.
