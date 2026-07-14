# OpenDS5 Update Backend — Design

Status: approved
Date: 2026-07-14
Branch: `feature/update-backend`

## Goal

Keep OpenDS5 current without the user ever opening a terminal.

At launch, if the last check was more than two days ago, ask GitHub whether a newer
stable release exists. If one does, offer it in a toast that does not block the app.
The user picks **Update**, **Remind me later**, or **Skip this version**. Choosing
Update carries the release all the way to a restarted app on one click.

Scope is Linux/AppImage only. On any other platform the checker is a no-op: there is
no Windows release pipeline to point it at (`release.yml` builds only the AppImage),
and the NSIS self-replace is a different mechanism that would need its own design.

## Source of truth

`GET https://api.github.com/repos/LordVicky/OpenDS5/releases/latest`, unauthenticated.

The release we already cut is the manifest — no second publishing step to keep in sync.
`/releases/latest` excludes drafts and prereleases at the API level, and `release.yml`
already passes `--prerelease` for semver tags containing a hyphen, so `v1.7.0-beta.1`
can never be offered to a stable user. We re-check `draft` and `prerelease` on the
parsed payload anyway rather than trusting the endpoint's semantics.

Rate limiting (60/hr/IP unauthenticated) is irrelevant at one request per two days.

The parser is strict: unknown fields ignored, required fields (`tag_name`, `assets`)
absent or malformed means "no update", never a crash and never a partial offer.

### Deciding when the driver really needs rebuilding

The tempting gate — "installed module version ≠ app version" — is wrong. `dkms.conf`
is stamped from `package.json`, so the module version *is* the app version, and it
differs after **every** release. That gate would demand a password on every update,
including a pure UI release that never touched a line of driver code.

Gate on the **module sources** instead. The sources are already bundled into the app
(`package.json` ships `vds/module` and `vds/include` as `extraResources` under
`vds-module/`), so the running app can hash the sources it carries — no new build step
and no new release asset:

- **`moduleSourceHash()`** — sha256 over the bundled module sources under
  `path.join(process.resourcesPath, 'vds-module')`: every file, walked in sorted path
  order, hashing the relative path and then the bytes, so a rename counts as a change.
- **`installedModuleSourceHash`** — a settings field recording the hash that was in the
  bundle the last time the installer completed successfully.

**Rebuild if and only if the module is installed and the bundled hash differs from the
recorded one.** A UI-only release leaves the hash unchanged and asks for nothing.

Two cases need care:

- **No module installed** (`modinfo -F version vds_hcd` returns nothing — a fresh or
  user-mode-only setup). Skip the installer entirely. Someone who never installed the
  driver must not be handed a password prompt by an app update.
- **Module installed but no recorded hash** (every existing user, upgrading into the
  first release that has this feature). Fall back to the version comparison: if
  `modinfo -F version vds_hcd` differs from `app.getVersion()`, rebuild; otherwise
  adopt the current bundle hash without rebuilding. After that one release, everyone
  is on the hash gate.

`modinfo -F version vds_hcd` needs no privileges and returns the exact stamp (verified:
returns `1.7.0-beta.1` on this machine).

## Release workflow change

`release.yml` currently publishes only the `.AppImage`. Add a step that computes
`sha256sum` over the built AppImage and uploads `<name>.AppImage.sha256` as a second
release asset.

Without this there is no integrity story beyond HTTPS, and "verify the download"
would be a claim we cannot back. The updater treats a missing or mismatched `.sha256`
as a hard failure and does not install.

## Flow

1. **Launch.** After the window is ready and the launch animation has settled
   (~1s), and only if no modal or startup tutorial is showing, the renderer asks
   main for an update decision.
2. **Gate.** Main checks `lastUpdateCheckAt`. If less than 48h ago, stop — no
   network call at all.
3. **Check.** Fetch the latest release. Parse. Compare against `app.getVersion()`
   using semver precedence, not string comparison. Record `lastUpdateCheckAt`
   regardless of the outcome, so a failed check does not retry on every launch.
4. **Decide.** Offer only if: newer version, and the version is not in
   `skippedUpdateVersions`, and an `.AppImage` asset plus its `.sha256` are present.
5. **Offer.** The toast appears bottom-right (see UI below).
6. **Download.** Stream the asset to a temp file *in the same directory as the
   running AppImage*, with progress reported to the toast.
7. **Verify.** sha256 the downloaded file against the `.sha256` asset. Mismatch →
   delete the temp file, show "Download failed", leave the installed version alone.
8. **Swap.** `chmod +x`, then `rename()` the temp file over `process.env.APPIMAGE`.
9. **Restart.** Offer "Restart now" or "On next launch". Either way the new
   AppImage is already on disk.
10. **Install, on the next launch.** See below.

### The installer must run *after* the relaunch, not before

The obvious ordering — swap, rebuild the module, then restart — is wrong, and
silently so.

`SetupService` resolves the installer through `resolveInstallerPath(process.resourcesPath)`
(`main.ts:1398`), and `process.resourcesPath` points inside the **currently mounted**
AppImage: the old one. It is also constructed with `app.getVersion()`, which is still
the old version. Running the installer before the relaunch would therefore rebuild the
**old** module from the **old** bundle's sources and stamp it with the **old** version —
the new module would never be installed, while every test still passed.

So the rebuild happens on the *next* launch, from the new mount, where
`process.resourcesPath` and `app.getVersion()` both describe the new release:

> On launch, before the update check, if a `vds_hcd` module is installed and the
> bundled module-source hash differs from `installedModuleSourceHash`, run the
> installer and show the "Installing" toast. No confirmation is asked — the polkit
> password dialog *is* the confirmation. On success, record the new hash.

This needs no persisted "update pending" flag: the mismatch between the sources the
app carries and the sources the installed driver was built from *is* the flag, and it
is self-healing — if the rebuild fails or the user dismisses the password prompt, the
hash is not recorded and the next launch simply tries again.

The user-visible order is therefore: download → verify → restart → installing → done —
and for a release that doesn't touch the driver, just download → verify → restart.

## The three actions

- **Update** — steps 6–10. The only click required.
- **Remind me later** — dismiss. No state written. The next launch past the 48h
  window offers it again.
- **Skip this version** — append the exact version string to `skippedUpdateVersions`.
  That version is never offered again; the next release is.

## AppImage self-replace — verified mechanics

These were tested against a real packaged AppImage
(`ELECTRON_RUN_AS_NODE=1 ~/AppImages/opends5.appimage -e '…'`), not assumed:

- `process.env.APPIMAGE` is the real on-disk path
  (`/home/lordvicky/AppImages/opends5.appimage`). It is **unset under `npm run dev`**,
  which is the signal we use to disable the updater outside a packaged build.
- `process.execPath` is the FUSE mount (`/tmp/.mount_opendsXXXX/ds5-bridge`), which
  **disappears when the process exits**. A bare `app.relaunch()` would therefore try
  to restart a path that no longer exists. The relaunch must be
  `app.relaunch({ execPath: process.env.APPIMAGE })`.
- The download must land in `dirname(APPIMAGE)` so the `rename()` is same-filesystem;
  a `/tmp` staging directory would fail with `EXDEV`.
- `rename()`-over-self is safe while running: the AppImage runtime holds an open fd on
  the old inode, so the mounted filesystem stays valid until exit. Writing *into* the
  running file (truncate + write) would corrupt it and must not be used.

### Read-only install location

If `dirname(APPIMAGE)` is not writable (e.g. the AppImage was placed in `/opt`), we
cannot self-replace. Probe this **before offering**, and degrade to a distinct toast:
"OpenDS5 can't replace itself in a read-only folder" with a button that opens the
release page. We never begin a download we cannot finish.

## UI

A non-blocking toast, bottom-right, matching the mockup:
<https://claude.ai/code/artifact/c24dc13a-a018-46de-80ca-53d7ec3758b3>

- **Never auto-dismisses.** The choice cannot be lost by walking away.
- **`z-index: 90`** — below the modal backdrop (100) and the startup tutorial (120),
  and suppressed entirely while either is open. It can never cover a dialog or
  interrupt first-run setup.
- **`width: min(348px, calc(100% - 32px))`** so it shrinks rather than clips at 150%
  UI scale or in a narrow window. Anchored to the window, not the reflowing card grid.
- Bottom-right is safe: the only resize handle is the 4px top edge
  (`.window-resize-edge`), so the toast covers no control.
- **Skip this version** is styled as a quiet text button, deliberately the hardest of
  the three to hit by reflex, because it is the most consequential.

States: offer → downloading → verifying → installing → ready to restart, plus
`download failed` and `read-only location`.

## Components

Each unit is separately testable with no Electron or network dependency except where
stated.

- **`src/main/update-checker.ts`** — pure. Given a release payload and a current
  version, decide offer / no-offer. Owns semver comparison, prerelease and draft
  rejection, skip-list filtering, and asset selection. No I/O.
- **`src/main/update-source.ts`** — the GitHub call. Fetch + strict parse into the
  typed payload the checker consumes. The only network code.
- **`src/main/appimage-updater.ts`** — download, sha256 verify, chmod, atomic rename,
  writability probe, relaunch. Takes the AppImage path by injection so tests drive a
  temp directory instead of the real one.
- **`src/main/module-source-hash.ts`** — `moduleSourceHash(root: string): string`, the
  sorted-walk sha256 above. Pure filesystem, no Electron.
- **`src/main/update-service.ts`** — orchestrates the flow above and owns the state
  machine the toast renders. Delegates the installer run to the existing
  `SetupService` rather than spawning the installer a second way. Every collaborator
  (download, hash, verify, swap, installer) is injected, so `start()` and the
  post-relaunch rebuild are both testable against a temp directory.
- **`src/renderer/UpdateToast.tsx`** — presentational; renders a state, emits actions.

## Settings

Two fields added to `CompanionSettings` (`src/shared/types.ts`), defaulted and
normalized in `settings-store.ts` in the existing style:

- `lastUpdateCheckAt: number` — epoch ms, `0` meaning never.
- `skippedUpdateVersions: string[]`
- `installedModuleSourceHash: string` — `''` meaning unknown (see the fallback above).

Both must survive a settings file that predates them; the store's existing
normalization path covers this and gets test coverage for these fields.

## IPC

`ipc-contract.test.ts` enforces that every preload `invoke` channel has exactly one
main handler, so these are added in matched pairs:

- `update:check` → the decision (offer / none / read-only).
- `update:start` → begin the download-through-install sequence.
- `update:skip`, `update:dismiss`, `update:restart`.
- `update:progress` → main-to-renderer event stream (download percent, installer
  steps). Must have a matching `removeListener` in preload, per the same test.

## Error handling

Every failure leaves the currently installed version working. That is the invariant.

- Offline, DNS failure, timeout, HTTP error, rate limit → silent no-op. No toast.
  The user did not ask to check for updates; a failed background check must not
  produce an error dialog.
- Malformed payload, missing AppImage asset, missing `.sha256` → treated as "no
  update available". Logged, not surfaced.
- Download interrupted or checksum mismatch → temp file deleted, "Download failed"
  toast with Try again. Nothing has been swapped at this point.
- `rename()` fails → the temp file is removed and the old AppImage is untouched;
  surface as a failed update.
- Installer fails or the user cancels the polkit prompt → the new app is already
  running; only the driver rebuild failed. Say so honestly and offer to retry.
  `installedModuleSourceHash` is **not** recorded, so the next launch retries by
  itself. Never pretend the update succeeded, and never roll the AppImage back.

## Testing

Unit tests (vitest, alongside the source as this codebase does):

- `update-checker.test.ts` — newer/older/equal versions; `1.10.0 > 1.9.0` (the case
  string comparison gets wrong); prerelease and draft rejected; skipped version not
  offered while its successor is; missing assets → no offer.
- `appimage-updater.test.ts` — against a temp dir: checksum mismatch does not swap;
  rename is atomic; a non-writable directory is detected before any download.
- `module-source-hash.test.ts` — identical trees hash equal; a changed byte, an added
  file, and a renamed file each change the hash.
- `update-service.test.ts` — the two-day gate; **`start()` driven end to end against a
  temp dir with a mocked installer** (this is the riskiest code in the feature and
  must not be left untested); the rebuild gate: unchanged hash asks for nothing,
  changed hash runs the installer, absent module never runs it, and a failed installer
  leaves the recorded hash alone so the next launch retries.
- `settings-store.test.ts` — the two new fields default correctly and a settings file
  written before this feature still loads.
- `ipc-contract.test.ts` — passes with the new channels (it will fail loudly if a
  preload channel lacks a handler).

Manual verification, on a real packaged AppImage rather than `npm run dev` (where
`APPIMAGE` is unset and the updater is disabled by design): stage an older version,
confirm the toast appears, and confirm the app relaunches into the new version.

## Out of scope

- Windows / NSIS updates.
- Background checks while the app is running. Launch-only, by decision: a dialog
  appearing over someone mid-game is worse than a late update.
- Delta updates, rollback, staged rollouts, mandatory updates.
