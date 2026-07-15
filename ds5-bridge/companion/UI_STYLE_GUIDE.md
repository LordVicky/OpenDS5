# OpenDS5 Companion UI Style Guide

This file is the layout contract for the Electron companion app. Treat it as part of the implementation, not inspiration. If a new control page needs a different geometry, document the reason here before adding new CSS.

## Layout Tokens

The shared grid values live in `src/renderer/styles.css` under `:root`.

- `--app-content-width: 820px` is the desktop content rail.
- `--layout-gap: 14px` is the vertical gap between the hero and active page.
- `--card-gap: 14px` is the gap between sibling cards.
- `--card-radius: 4px` is the standard card radius for the flatter desktop style.
- `--control-radius: 3px` is the standard radius for buttons, selects, toggles, and framed controls.
- `--card-padding: 16px` is the standard card interior padding.
- `--feature-left-column: minmax(0, 1fr)` and `--feature-right-column: minmax(0, 1fr)` keep the main paired cards equal width.
- `--feature-card-min-height: 250px` keeps feature cards aligned tab to tab.
- `--feature-card-height: 355px` sets the shared minimum for Haptics, Audio, Triggers, Lighting, and System paired cards. Cards should stay content-sized above that minimum instead of stretching to the viewport.
- `--action-height: 48px` is the standard full-width action button height.
- `--control-height: 36px` is the standard compact control height.

Do not hardcode replacements for these values in a tab unless the component is a true exception.

## Page Structure

Every main tab should follow this order:

1. `feature-heading`
   - Left: page title and one short sentence.
   - Right: page-level enabled switch when the feature supports a kill switch.
2. `feature-card-grid`
   - Left card: primary setting or value control.
   - Right card: testing, behavior, status, or secondary controls.

The outer `control-panel` is intentionally flat. Do not wrap feature cards in another visual card; the repeated paired-card layout is the page structure.

Lighting and System must preserve the same two-column card geometry as Haptics, Audio, and Triggers. Their card bottoms should align within the active tab and their rendered card heights should match the other main tabs.

## Card Grid

Feature tabs must use:

```tsx
<div className="feature-card-grid">
  <section className="feature-card">...</section>
  <section className="feature-card">...</section>
</div>
```

The left and right cards should be the same width and height by default. The right column should not choose its own width. The card row should size to its content and shared minimum, not to the full remaining window height. If one right-column card needs a width or height adjustment, change the shared grid token or add a named grid variant so the rule is visible and reusable.

System may use `system-card` for semantic naming, but it still follows the same paired-card width and height contract as `feature-card`.

## Controls

- Sliders use `stacked-slider` plus `framed-slider` when they are the primary setting in a card.
- Slider labels, track, and value should stay in the same vertical position between Haptics, Audio, and Triggers.
- Percent sliders should use the shared `slider-row`, `range-control`, and `range-ticks` geometry. If a slider is intentionally notched, its native range `step` must match visible tick positions and it must not add tab-specific grid sizing.
- Testing buttons use `primary-action` and `secondary-action`.
- Testing cards are slotted, not free-flowing. The primary and secondary action rows must stay in the same vertical grid rows across Haptics, Audio, and Triggers, even when the setup content above them differs.
- Status copy at the bottom of test cards uses `feature-status`.
- Preset or level buttons use `segmented-row`.
- Dropdowns must use `CustomSelect`; do not use native `select` elements in the app surface.
- Icon buttons and tab labels use `lucide-react` icons.

## Lighting Preview

The Lighting tab sends raw RGB bytes plus a separate brightness percentage to the firmware. Firmware scales the bytes linearly before writing the DualSense lightbar report. The live lightbar preview is intentionally hidden for now because it created misleading expectations about real controller brightness. Use `selected-color-info` for the selected name and hex value instead.

Light color selection belongs in the Lighting behavior card. Preset swatches should use literal, saturated send values so the preview square matches the bytes sent to the controller: `#FFFF00`, `#0000FF`, `#00FF00`, `#FF0000`, `#8000FF`, and `#FFFFFF`. The custom swatch stores the last picker value separately from preset selection: one click returns to that saved custom color, while double-click opens the compact dark palette-grid color popover. The selected custom swatch should show the custom color as the interior fill with a gradient border only around the edge. Animate that border only on hover/focus or while the picker is open, and keep it as a slow shimmer rather than a spinning rainbow. Palette-cell clicks should immediately preview the color on the controller; the "Use Color" action saves that previewed color as the remembered custom color. Palette color names are exact labels owned by the grid data, not approximate nearest-color guesses.

Shelved research note: DualSense lightbar output is likely raw PWM rather than display-managed sRGB. A future calibrated mode could test gamma and per-channel weights against real hardware, but guessing those values in the normal UI made brightness misleading.

## Game Profile Tab

The Game Profile tab is the app's landing page and intentionally deviates from the
paired-card contract: it is a cover grid (Nvidia-App style), not a settings surface.
Its geometry rules:

- The grid uses `game-tile-grid` (`repeat(auto-fill, minmax(148px, 1fr))`) with 3:4
  cover tiles; tiles without SteamGridDB art render a deterministic gradient +
  monogram (`game-tile-art-N`, literal colors on purpose — they stand in for box art
  and do not follow the UI theme).
- The per-game hub header (`game-detail-header`) and the Now Playing hero
  (`game-hero`) are single full-width cards; everything below the hub header reuses
  `overview-card-grid`.
- While a game hub is open and another tab is active, `game-scope-banner` renders
  above `control-pages` and the panel gets `game-scope-active`, which relaxes
  `.control-pages` to `height: auto` so the banner can scroll with the page. Settings
  pages themselves are NOT forked per game: scope is switched by selecting the
  game-owned (`game:<trigger-profile-id>`) controller/remap profiles, so every tab
  keeps its normal geometry.

## Visual QA

Before considering a UI change finished:

1. Run `npm run typecheck` from `companion/`.
2. Only run `npm run visual:smoke` from `companion/` when the user explicitly asks for it.
3. If visual smoke was requested, inspect the screenshots in `companion/artifacts/ui/`.
4. When manually testing the app, flip between Haptics, Audio, Triggers, Lighting, and System and check that repeated controls do not jump around without a clear reason.

The app should look like a tool surface: dense, calm, consistent, and readable. Avoid decorative layout changes that make one tab feel like it was designed in isolation.
