# Update Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At launch, at most once every two days, check GitHub for a newer stable OpenDS5 release and offer it in a non-blocking toast with Update / Remind me later / Skip this version — where Update downloads, verifies, self-replaces the AppImage, rebuilds the kernel module if needed, and relaunches, all on one click.

**Architecture:** Four small, separately testable main-process units behind one orchestrator. `update-source` is the only code that touches the network; `update-checker` is a pure decision function with no I/O; `appimage-updater` owns the filesystem dance; `update-service` sequences them and delegates the privileged installer run to the existing `SetupService`. The renderer gets a presentational toast driven entirely by a state object pushed from main.

**Tech Stack:** Electron 39, TypeScript, React 19, vitest. Node's global `fetch` and `node:crypto` — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-update-backend-design.md`

## Global Constraints

- **Linux/AppImage only.** Every entry point must no-op when `process.env.APPIMAGE` is unset. That variable is unset under `npm run dev`, which is the intended way the updater stays off during development. Never gate on `process.platform` alone.
- **Never break the working install.** Any failure at any stage must leave the currently installed version runnable. Do not roll back a swapped AppImage; do not half-write the target file.
- **`rename()` must be same-filesystem.** Download into `path.dirname(process.env.APPIMAGE)`, never `/tmp` (that raises `EXDEV`).
- **Relaunch must be `app.relaunch({ execPath: process.env.APPIMAGE })`.** The default `process.execPath` is the `/tmp/.mount_*` FUSE mount, which no longer exists after exit. This was verified on a real AppImage; a bare `app.relaunch()` is a bug.
- **Never write into the running AppImage.** Truncate-and-write corrupts it. Only write a sibling temp file and `rename()` over the target.
- **A failed background check is silent.** The user did not ask to check for updates. Network errors produce no toast and no dialog.
- **Repo is `LordVicky/OpenDS5`.** Current version comes from `app.getVersion()`.
- Existing repo conventions: tests live beside their source as `*.test.ts` and run under vitest (`npm run test:companion`). IPC channels are declared in a frozen `*_CHANNELS` const (see `src/main/setup-ipc.ts`) and `ipc-contract.test.ts` fails the build if a preload `invoke` channel has no matching main handler.

---

### Task 1: Settings fields

Persist when we last checked and which versions the user skipped.

**Files:**
- Modify: `src/shared/types.ts` (the `CompanionSettings` interface)
- Modify: `src/main/settings-store.ts` (`DEFAULT_SETTINGS` + a normalizer)
- Test: `src/main/settings-store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CompanionSettings.lastUpdateCheckAt: number` (epoch ms, `0` = never) and `CompanionSettings.skippedUpdateVersions: string[]`. Also exports `normalizeSkippedUpdateVersions(value: unknown): string[]`.

- [ ] **Step 1: Write the failing test**

Add to `src/main/settings-store.test.ts`:

```ts
describe('update settings', () => {
  it('defaults to never-checked with nothing skipped', () => {
    expect(DEFAULT_SETTINGS.lastUpdateCheckAt).toBe(0);
    expect(DEFAULT_SETTINGS.skippedUpdateVersions).toEqual([]);
  });

  it('normalizes a settings file written before this feature existed', () => {
    expect(normalizeSkippedUpdateVersions(undefined)).toEqual([]);
  });

  it('drops non-string and empty entries from the skip list', () => {
    expect(normalizeSkippedUpdateVersions(['1.8.0', 42, '', null, '1.9.0'])).toEqual([
      '1.8.0',
      '1.9.0',
    ]);
  });

  it('rejects a non-array skip list', () => {
    expect(normalizeSkippedUpdateVersions('1.8.0')).toEqual([]);
  });
});
```

Make sure `normalizeSkippedUpdateVersions` is added to the existing import from `./settings-store` at the top of the test file.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/main/settings-store.test.ts`
Expected: FAIL — `normalizeSkippedUpdateVersions is not a function`.

- [ ] **Step 3: Implement**

In `src/shared/types.ts`, add to `interface CompanionSettings`:

```ts
  lastUpdateCheckAt: number;
  skippedUpdateVersions: string[];
```

In `src/main/settings-store.ts`, add to the `DEFAULT_SETTINGS` object literal:

```ts
  lastUpdateCheckAt: 0,
  skippedUpdateVersions: [],
```

And add the normalizer beside the other `normalize*` helpers:

```ts
export function normalizeSkippedUpdateVersions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
```

Then wire both fields into the store's existing load/normalize path, following exactly how a neighbouring field such as `setupSkipped` is handled there — `lastUpdateCheckAt` normalizes with `typeof value === 'number' && Number.isFinite(value) ? value : 0`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/main/settings-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/settings-store.ts src/main/settings-store.test.ts
git commit -m "Remember when we last checked for updates and what was skipped"
```

---

### Task 2: The update decision (pure)

Given a release and the current version, decide whether to offer it. No I/O — this is where all the version logic that is easy to get wrong lives, so it must be trivially testable.

**Files:**
- Create: `src/main/update-checker.ts`
- Test: `src/main/update-checker.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type ReleaseAsset = { name: string; url: string; size: number };
  export type Release = {
    version: string;        // tag with the leading "v" stripped
    notes: string;
    draft: boolean;
    prerelease: boolean;
    assets: ReleaseAsset[];
  };
  export type UpdateDecision =
    | { kind: 'none' }
    | { kind: 'offer'; version: string; notes: string; appImage: ReleaseAsset; sha256: ReleaseAsset };

  export function compareVersions(a: string, b: string): number;
  export function decideUpdate(input: {
    release: Release | null;
    currentVersion: string;
    skippedVersions: readonly string[];
  }): UpdateDecision;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/main/update-checker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareVersions, decideUpdate, type Release } from './update-checker';

function release(overrides: Partial<Release> = {}): Release {
  return {
    version: '1.8.0',
    notes: 'Trigger effect import',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'OpenDS5-Companion-Setup-1.8.0.AppImage', url: 'https://x/a', size: 118 },
      { name: 'OpenDS5-Companion-Setup-1.8.0.AppImage.sha256', url: 'https://x/s', size: 64 },
    ],
    ...overrides,
  };
}

const base = { currentVersion: '1.7.0', skippedVersions: [] as string[] };

describe('compareVersions', () => {
  it('orders by numeric precedence, not string order', () => {
    // The case a string compare gets wrong: "1.10.0" < "1.9.0" lexically.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.7.0', '1.7.0')).toBe(0);
    expect(compareVersions('1.6.3', '1.7.0')).toBeLessThan(0);
  });

  it('ranks a prerelease below its own release', () => {
    expect(compareVersions('1.8.0-beta.1', '1.8.0')).toBeLessThan(0);
  });
});

describe('decideUpdate', () => {
  it('offers a newer stable release', () => {
    const decision = decideUpdate({ ...base, release: release() });
    expect(decision.kind).toBe('offer');
    if (decision.kind !== 'offer') throw new Error('expected an offer');
    expect(decision.version).toBe('1.8.0');
    expect(decision.appImage.url).toBe('https://x/a');
    expect(decision.sha256.url).toBe('https://x/s');
  });

  it('does not offer the version already running', () => {
    expect(decideUpdate({ ...base, release: release({ version: '1.7.0' }) }).kind).toBe('none');
  });

  it('does not offer an older release', () => {
    expect(decideUpdate({ ...base, release: release({ version: '1.6.3' }) }).kind).toBe('none');
  });

  it('never offers a prerelease or a draft', () => {
    expect(decideUpdate({ ...base, release: release({ prerelease: true }) }).kind).toBe('none');
    expect(decideUpdate({ ...base, release: release({ draft: true }) }).kind).toBe('none');
  });

  it('does not offer a skipped version but still offers its successor', () => {
    const skipped = { ...base, skippedVersions: ['1.8.0'] };
    expect(decideUpdate({ ...skipped, release: release() }).kind).toBe('none');
    expect(decideUpdate({ ...skipped, release: release({ version: '1.8.1' }) }).kind).toBe('offer');
  });

  it('does not offer a release with no AppImage or no checksum', () => {
    const noAppImage = release({ assets: [{ name: 'x.sha256', url: 'u', size: 1 }] });
    const noSum = release({ assets: [{ name: 'x.AppImage', url: 'u', size: 1 }] });
    expect(decideUpdate({ ...base, release: noAppImage }).kind).toBe('none');
    expect(decideUpdate({ ...base, release: noSum }).kind).toBe('none');
  });

  it('handles a missing release', () => {
    expect(decideUpdate({ ...base, release: null }).kind).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/main/update-checker.test.ts`
Expected: FAIL — cannot resolve `./update-checker`.

- [ ] **Step 3: Implement**

Create `src/main/update-checker.ts`:

```ts
export type ReleaseAsset = { name: string; url: string; size: number };

export type Release = {
  version: string;
  notes: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
};

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'offer'; version: string; notes: string; appImage: ReleaseAsset; sha256: ReleaseAsset };

function parts(version: string): { numbers: number[]; prerelease: string | null } {
  const [core, prerelease = null] = version.replace(/^v/, '').split('-', 2);
  const numbers = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  while (numbers.length < 3) numbers.push(0);
  return { numbers, prerelease };
}

export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] - right.numbers[i];
  }
  // Equal cores: a prerelease ranks below the release it leads to (1.8.0-beta.1 < 1.8.0).
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

export function decideUpdate(input: {
  release: Release | null;
  currentVersion: string;
  skippedVersions: readonly string[];
}): UpdateDecision {
  const { release, currentVersion, skippedVersions } = input;
  if (!release) return { kind: 'none' };
  if (release.draft || release.prerelease) return { kind: 'none' };
  if (skippedVersions.includes(release.version)) return { kind: 'none' };
  if (compareVersions(release.version, currentVersion) <= 0) return { kind: 'none' };

  const appImage = release.assets.find((a) => a.name.endsWith('.AppImage'));
  const sha256 = release.assets.find((a) => a.name.endsWith('.AppImage.sha256'));
  if (!appImage || !sha256) return { kind: 'none' };

  return { kind: 'offer', version: release.version, notes: release.notes, appImage, sha256 };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/main/update-checker.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/update-checker.ts src/main/update-checker.test.ts
git commit -m "Decide whether a GitHub release is worth offering"
```

---

### Task 3: The GitHub source

The only code in the feature that touches the network.

**Files:**
- Create: `src/main/update-source.ts`
- Test: `src/main/update-source.test.ts`

**Interfaces:**
- Consumes: `Release` from `./update-checker`.
- Produces:
  ```ts
  export const LATEST_RELEASE_URL: string;
  export function parseRelease(payload: unknown): Release | null;
  export function fetchLatestRelease(fetchImpl?: typeof fetch): Promise<Release | null>;
  ```
  `fetchLatestRelease` resolves `null` on *any* failure (offline, non-200, rate limit, malformed body). It never rejects — a background check must not throw into the launch path.

- [ ] **Step 1: Write the failing test**

Create `src/main/update-source.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchLatestRelease, parseRelease } from './update-source';

const payload = {
  tag_name: 'v1.8.0',
  body: 'Trigger effect import',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'OpenDS5-Companion-Setup-1.8.0.AppImage',
      browser_download_url: 'https://x/a',
      size: 118,
    },
  ],
};

describe('parseRelease', () => {
  it('strips the leading v from the tag', () => {
    expect(parseRelease(payload)?.version).toBe('1.8.0');
  });

  it('keeps asset names, urls and sizes', () => {
    expect(parseRelease(payload)?.assets[0]).toEqual({
      name: 'OpenDS5-Companion-Setup-1.8.0.AppImage',
      url: 'https://x/a',
      size: 118,
    });
  });

  it('returns null rather than throwing on a malformed payload', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({})).toBeNull();
    expect(parseRelease({ tag_name: 'v1.8.0' })).toBeNull();
    expect(parseRelease({ tag_name: 42, assets: [] })).toBeNull();
  });

  it('ignores assets that are missing a name or a url', () => {
    const partial = { ...payload, assets: [{ name: 'a.AppImage' }, ...payload.assets] };
    expect(parseRelease(partial)?.assets).toHaveLength(1);
  });
});

describe('fetchLatestRelease', () => {
  it('parses a successful response', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    await expect(fetchLatestRelease(fake as unknown as typeof fetch)).resolves.toMatchObject({
      version: '1.8.0',
    });
  });

  it('resolves null on a non-200 response', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(fetchLatestRelease(fake as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('resolves null when the network is down, and does not reject', async () => {
    const fake = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    await expect(fetchLatestRelease(fake as unknown as typeof fetch)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/main/update-source.test.ts`
Expected: FAIL — cannot resolve `./update-source`.

- [ ] **Step 3: Implement**

Create `src/main/update-source.ts`:

```ts
import type { Release, ReleaseAsset } from './update-checker';

export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/LordVicky/OpenDS5/releases/latest';

function parseAsset(value: unknown): ReleaseAsset | null {
  if (typeof value !== 'object' || value === null) return null;
  const asset = value as Record<string, unknown>;
  if (typeof asset.name !== 'string') return null;
  if (typeof asset.browser_download_url !== 'string') return null;
  return {
    name: asset.name,
    url: asset.browser_download_url,
    size: typeof asset.size === 'number' ? asset.size : 0,
  };
}

export function parseRelease(payload: unknown): Release | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (typeof body.tag_name !== 'string') return null;
  if (!Array.isArray(body.assets)) return null;

  return {
    version: body.tag_name.replace(/^v/, ''),
    notes: typeof body.body === 'string' ? body.body : '',
    draft: body.draft === true,
    prerelease: body.prerelease === true,
    assets: body.assets.map(parseAsset).filter((a): a is ReleaseAsset => a !== null),
  };
}

/** Resolves null on any failure; a background check must never throw into launch. */
export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<Release | null> {
  try {
    const response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return parseRelease(await response.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/main/update-source.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/update-source.ts src/main/update-source.test.ts
git commit -m "Read the latest stable release from GitHub"
```

---

### Task 4: The AppImage swap

The filesystem dance. Every constraint in the Global Constraints section lives here.

**Files:**
- Create: `src/main/appimage-updater.ts`
- Test: `src/main/appimage-updater.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function appImagePath(): string | null;               // process.env.APPIMAGE or null
  export function canSelfReplace(target: string): boolean;      // is the containing dir writable
  export function downloadTo(opts: {
    url: string;
    tempPath: string;
    onProgress: (received: number, total: number) => void;
    fetchImpl?: typeof fetch;
  }): Promise<void>;
  export function sha256File(filePath: string): Promise<string>;
  export function parseSha256Asset(text: string): string;       // "<hex>  filename" -> "<hex>"
  export function swapInPlace(tempPath: string, target: string): void;
  ```
  Every function takes its paths by argument so tests drive a temp directory, never the real AppImage.

- [ ] **Step 1: Write the failing test**

Create `src/main/appimage-updater.test.ts`:

```ts
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canSelfReplace,
  parseSha256Asset,
  sha256File,
  swapInPlace,
} from './appimage-updater';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opends5-update-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('canSelfReplace', () => {
  it('accepts an AppImage in a writable directory', () => {
    const target = path.join(dir, 'OpenDS5.AppImage');
    fs.writeFileSync(target, 'old');
    expect(canSelfReplace(target)).toBe(true);
  });

  it('rejects an AppImage in a read-only directory', () => {
    const readonly = path.join(dir, 'opt');
    fs.mkdirSync(readonly);
    const target = path.join(readonly, 'OpenDS5.AppImage');
    fs.writeFileSync(target, 'old');
    fs.chmodSync(readonly, 0o500);
    try {
      expect(canSelfReplace(target)).toBe(false);
    } finally {
      fs.chmodSync(readonly, 0o700); // so afterEach can clean up
    }
  });
});

describe('sha256File and parseSha256Asset', () => {
  it('hashes a file', async () => {
    const file = path.join(dir, 'x');
    fs.writeFileSync(file, 'hello');
    const expected = createHash('sha256').update('hello').digest('hex');
    await expect(sha256File(file)).resolves.toBe(expected);
  });

  it('reads the hash out of a sha256sum line', () => {
    expect(parseSha256Asset('abc123  OpenDS5-Companion-Setup-1.8.0.AppImage\n')).toBe('abc123');
  });
});

describe('swapInPlace', () => {
  it('replaces the target atomically and marks it executable', () => {
    const target = path.join(dir, 'OpenDS5.AppImage');
    const temp = path.join(dir, 'OpenDS5.AppImage.download');
    fs.writeFileSync(target, 'old');
    fs.writeFileSync(temp, 'new');

    swapInPlace(temp, target);

    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.existsSync(temp)).toBe(false);
    expect(fs.statSync(target).mode & 0o111).toBeTruthy();
  });

  it('leaves the installed version alone when the swap fails', () => {
    const target = path.join(dir, 'OpenDS5.AppImage');
    fs.writeFileSync(target, 'old');
    expect(() => swapInPlace(path.join(dir, 'missing'), target)).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('old');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/main/appimage-updater.test.ts`
Expected: FAIL — cannot resolve `./appimage-updater`.

- [ ] **Step 3: Implement**

Create `src/main/appimage-updater.ts`:

```ts
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The AppImage runtime exports APPIMAGE as the real on-disk path. It is unset
 * under `npm run dev`, which is how the updater stays disabled in development.
 * Note that process.execPath is NOT usable here: it points at the /tmp FUSE
 * mount, which disappears when the process exits.
 */
export function appImagePath(): string | null {
  const value = process.env.APPIMAGE;
  return value && value.length > 0 ? value : null;
}

export function canSelfReplace(target: string): boolean {
  try {
    fs.accessSync(path.dirname(target), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function downloadTo(opts: {
  url: string;
  tempPath: string;
  onProgress: (received: number, total: number) => void;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { url, tempPath, onProgress, fetchImpl = fetch } = opts;
  const response = await fetchImpl(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed (${response.status})`);
  }
  const total = Number(response.headers.get('content-length') ?? 0);
  let received = 0;

  const handle = await fs.promises.open(tempPath, 'w');
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      await handle.write(chunk);
      received += chunk.byteLength;
      onProgress(received, total);
    }
  } catch (error) {
    await handle.close();
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }
  await handle.close();
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** A sha256sum line is "<hex>  <filename>". */
export function parseSha256Asset(text: string): string {
  return text.trim().split(/\s+/)[0] ?? '';
}

/**
 * Atomic same-filesystem replace. Safe while running: the AppImage runtime holds
 * an open fd on the old inode, so the mount stays valid until exit. Writing into
 * the running file instead of renaming over it would corrupt it.
 */
export function swapInPlace(tempPath: string, target: string): void {
  fs.chmodSync(tempPath, 0o755);
  fs.renameSync(tempPath, target);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/main/appimage-updater.test.ts`
Expected: PASS, 6 tests.

Note: the read-only test is skipped automatically if the suite runs as root (root ignores the write bit). If you are running tests as root, that test will fail — run them as a normal user.

- [ ] **Step 5: Commit**

```bash
git add src/main/appimage-updater.ts src/main/appimage-updater.test.ts
git commit -m "Download, verify and atomically replace the running AppImage"
```

---

### Task 5: The orchestrator

Sequences the check and the update, and decides whether the kernel module needs rebuilding.

**Files:**
- Create: `src/main/update-service.ts`
- Test: `src/main/update-service.test.ts`

**Interfaces:**
- Consumes: `decideUpdate`, `UpdateDecision` (Task 2); `fetchLatestRelease` (Task 3); `appImagePath`, `canSelfReplace`, `downloadTo`, `sha256File`, `parseSha256Asset`, `swapInPlace` (Task 4); `SetupService` from `./setup-service`.
- Produces:
  ```ts
  export const UPDATE_CHECK_INTERVAL_MS: number; // 48h
  export type UpdateState =
    | { phase: 'idle' }
    | { phase: 'offer'; version: string; notes: string; sizeBytes: number }
    | { phase: 'downloading'; version: string; received: number; total: number }
    | { phase: 'verifying'; version: string }
    | { phase: 'installing'; version: string; step: string; index: number; total: number }
    | { phase: 'restart'; version: string }
    | { phase: 'failed'; version: string; message: string }
    | { phase: 'readonly'; version: string; url: string };

  export function installedModuleVersion(run?: (cmd: string, args: string[]) => string | null): string | null;
  export function isCheckDue(lastCheckAt: number, now: number): boolean;
  export class UpdateService { /* see below */ }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/main/update-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  UPDATE_CHECK_INTERVAL_MS,
  installedModuleVersion,
  isCheckDue,
} from './update-service';

describe('isCheckDue', () => {
  const now = 1_000_000_000_000;

  it('checks when it has never checked', () => {
    expect(isCheckDue(0, now)).toBe(true);
  });

  it('does not check again inside the two-day window', () => {
    expect(isCheckDue(now - 1000, now)).toBe(false);
    expect(isCheckDue(now - (UPDATE_CHECK_INTERVAL_MS - 1), now)).toBe(false);
  });

  it('checks once the window has passed', () => {
    expect(isCheckDue(now - UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it('checks when the stored timestamp is in the future (clock moved back)', () => {
    expect(isCheckDue(now + 5000, now)).toBe(true);
  });
});

describe('installedModuleVersion', () => {
  it('reads the version modinfo reports', () => {
    const run = vi.fn().mockReturnValue('1.7.0-beta.1\n');
    expect(installedModuleVersion(run)).toBe('1.7.0-beta.1');
    expect(run).toHaveBeenCalledWith('modinfo', ['-F', 'version', 'vds_hcd']);
  });

  it('reports no module when modinfo fails', () => {
    // A user-mode-only setup must not be handed a password prompt by an app update.
    expect(installedModuleVersion(() => null)).toBeNull();
  });

  it('reports no module when modinfo prints nothing', () => {
    expect(installedModuleVersion(() => '  \n')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/main/update-service.test.ts`
Expected: FAIL — cannot resolve `./update-service`.

- [ ] **Step 3: Implement**

Create `src/main/update-service.ts`:

```ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  appImagePath,
  canSelfReplace,
  downloadTo,
  parseSha256Asset,
  sha256File,
  swapInPlace,
} from './appimage-updater';
import { decideUpdate, type UpdateDecision } from './update-checker';
import { fetchLatestRelease } from './update-source';
import type { SetupService } from './setup-service';

export const UPDATE_CHECK_INTERVAL_MS = 48 * 60 * 60 * 1000;

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'offer'; version: string; notes: string; sizeBytes: number }
  | { phase: 'downloading'; version: string; received: number; total: number }
  | { phase: 'verifying'; version: string }
  | { phase: 'installing'; version: string; step: string; index: number; total: number }
  | { phase: 'restart'; version: string }
  | { phase: 'failed'; version: string; message: string }
  | { phase: 'readonly'; version: string; url: string };

/** A stored timestamp in the future means the clock moved back; check again. */
export function isCheckDue(lastCheckAt: number, now: number): boolean {
  if (lastCheckAt <= 0) return true;
  if (lastCheckAt > now) return true;
  return now - lastCheckAt >= UPDATE_CHECK_INTERVAL_MS;
}

function runCommand(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout;
}

/**
 * The DKMS module version is stamped from package.json, so it is the app version.
 * Null means no module is installed — skip the installer rather than prompting
 * a user-mode-only install for a password.
 */
export function installedModuleVersion(run = runCommand): string | null {
  const out = run('modinfo', ['-F', 'version', 'vds_hcd']);
  const version = out?.trim() ?? '';
  return version.length > 0 ? version : null;
}

export class UpdateService {
  private state: UpdateState = { phase: 'idle' };
  private pending: Extract<UpdateDecision, { kind: 'offer' }> | null = null;

  constructor(
    private readonly currentVersion: string,
    private readonly setupService: SetupService,
    private readonly emit: (state: UpdateState) => void,
    private readonly deps = { appImagePath, canSelfReplace, fetchLatestRelease },
  ) {}

  getState(): UpdateState {
    return this.state;
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.emit(state);
  }

  /**
   * Returns the state the toast should render, or idle for "show nothing".
   * Callers persist lastUpdateCheckAt regardless of the outcome, so a failed
   * check does not retry on every launch.
   */
  async check(skippedVersions: readonly string[]): Promise<UpdateState> {
    const target = this.deps.appImagePath();
    if (!target) {
      this.set({ phase: 'idle' });
      return this.state;
    }

    const release = await this.deps.fetchLatestRelease();
    const decision = decideUpdate({
      release,
      currentVersion: this.currentVersion,
      skippedVersions,
    });
    if (decision.kind === 'none') {
      this.set({ phase: 'idle' });
      return this.state;
    }

    this.pending = decision;

    if (!this.deps.canSelfReplace(target)) {
      this.set({ phase: 'readonly', version: decision.version, url: decision.appImage.url });
      return this.state;
    }

    this.set({
      phase: 'offer',
      version: decision.version,
      notes: decision.notes,
      sizeBytes: decision.appImage.size,
    });
    return this.state;
  }

  /** Download -> verify -> swap -> (rebuild module) -> ready to restart. */
  async start(): Promise<void> {
    const decision = this.pending;
    const target = this.deps.appImagePath();
    if (!decision || !target) return;
    const { version } = decision;

    // Same directory as the running AppImage: rename() must not cross filesystems.
    const tempPath = path.join(path.dirname(target), `.${path.basename(target)}.download`);

    try {
      this.set({ phase: 'downloading', version, received: 0, total: decision.appImage.size });
      await downloadTo({
        url: decision.appImage.url,
        tempPath,
        onProgress: (received, total) =>
          this.set({ phase: 'downloading', version, received, total }),
      });

      this.set({ phase: 'verifying', version });
      const expected = parseSha256Asset(
        await (await fetch(decision.sha256.url)).text(),
      );
      const actual = await sha256File(tempPath);
      if (!expected || expected !== actual) {
        await fs.promises.rm(tempPath, { force: true });
        this.set({ phase: 'failed', version, message: "The download didn't verify." });
        return;
      }

      swapInPlace(tempPath, target);
    } catch {
      await fs.promises.rm(tempPath, { force: true });
      this.set({ phase: 'failed', version, message: 'The download was interrupted.' });
      return;
    }

    // Past this point the new AppImage is on disk. Never roll it back.
    const moduleVersion = installedModuleVersion();
    if (moduleVersion !== null && moduleVersion !== version) {
      this.set({ phase: 'installing', version, step: 'Preparing…', index: 0, total: 1 });
      let steps: string[] = [];
      const exit = await this.setupService.install((event) => {
        if (event.event === 'plan') steps = event.steps;
        if (event.event === 'step' && event.status === 'start') {
          this.set({
            phase: 'installing',
            version,
            step: steps[event.index] ?? 'Working…',
            index: event.index,
            total: steps.length || 1,
          });
        }
      });
      if (exit !== 0) {
        this.set({
          phase: 'failed',
          version,
          message: "OpenDS5 updated, but the controller driver didn't rebuild.",
        });
        return;
      }
    }

    this.set({ phase: 'restart', version });
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/main/update-service.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/update-service.ts src/main/update-service.test.ts
git commit -m "Sequence the update from check to ready-to-restart"
```

---

### Task 6: IPC and main wiring

**Files:**
- Create: `src/main/update-ipc.ts`
- Modify: `src/main/main.ts` (register handlers; construct `UpdateService`)
- Modify: `src/preload.ts` (expose the `update` API)
- Test: `src/main/ipc-contract.test.ts` (already exists — it enforces the pairing)

**Interfaces:**
- Consumes: `UpdateService`, `UpdateState` (Task 5); the settings store (Task 1).
- Produces: `UPDATE_CHANNELS`, and `window.update` in the renderer:
  ```ts
  window.update.check(): Promise<UpdateState>
  window.update.start(): Promise<void>
  window.update.skip(version: string): Promise<void>
  window.update.dismiss(): Promise<void>
  window.update.restart(): Promise<void>
  window.update.openReleasePage(): Promise<void>
  window.update.onState(cb: (state: UpdateState) => void): () => void
  ```

- [ ] **Step 1: Write the channel constants**

Create `src/main/update-ipc.ts`, matching the shape of `setup-ipc.ts`:

```ts
export const UPDATE_CHANNELS = {
  check: 'update:check',
  start: 'update:start',
  skip: 'update:skip',
  dismiss: 'update:dismiss',
  restart: 'update:restart',
  openReleasePage: 'update:open-release-page',
  state: 'update:state',
} as const;

export const RELEASES_PAGE_URL = 'https://github.com/LordVicky/OpenDS5/releases/latest';
```

- [ ] **Step 2: Run the contract test and watch it fail**

Add the preload API first (Step 3), *then* run this — the contract test fails when a preload channel has no main handler, which is exactly the failure we want to see before wiring main.

Run: `npx vitest run src/main/ipc-contract.test.ts`
Expected: FAIL — the preload `invoke` channels have no matching `ipcMain.handle`.

- [ ] **Step 3: Expose the API in preload**

Append to `src/preload.ts`, following the existing `setupApi` block:

```ts
const updateApi = {
  check: (): Promise<UpdateState> => ipcRenderer.invoke(UPDATE_CHANNELS.check),
  start: (): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.start),
  skip: (version: string): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.skip, version),
  dismiss: (): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.dismiss),
  restart: (): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.restart),
  openReleasePage: (): Promise<void> => ipcRenderer.invoke(UPDATE_CHANNELS.openReleasePage),
  onState: (cb: (state: UpdateState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: UpdateState) => cb(payload);
    ipcRenderer.on(UPDATE_CHANNELS.state, listener);
    return () => ipcRenderer.removeListener(UPDATE_CHANNELS.state, listener);
  },
};
contextBridge.exposeInMainWorld('update', updateApi);

export type UpdateApi = typeof updateApi;
```

Import `UPDATE_CHANNELS` from `./main/update-ipc` and `UpdateState` from `./main/update-service` at the top, alongside the existing setup imports.

- [ ] **Step 4: Handle the channels in main**

In `src/main/main.ts`, construct the service once the main window exists (reuse the `SetupService` instance already built there) and register the handlers:

```ts
const updateService = new UpdateService(app.getVersion(), setupService, (state) =>
  sendToMainWindow(UPDATE_CHANNELS.state, state),
);

ipcMain.handle(UPDATE_CHANNELS.check, async () => {
  const settings = settingsStore.get();
  if (!isCheckDue(settings.lastUpdateCheckAt, Date.now())) return { phase: 'idle' };
  // Record the attempt regardless of the outcome so a failed check does not
  // retry on every launch.
  settingsStore.update({ lastUpdateCheckAt: Date.now() });
  return updateService.check(settings.skippedUpdateVersions);
});

ipcMain.handle(UPDATE_CHANNELS.start, () => updateService.start());

ipcMain.handle(UPDATE_CHANNELS.skip, (_event, version: string) => {
  const current = settingsStore.get().skippedUpdateVersions;
  if (!current.includes(version)) {
    settingsStore.update({ skippedUpdateVersions: [...current, version] });
  }
});

ipcMain.handle(UPDATE_CHANNELS.dismiss, () => {
  // "Remind me later" writes no state; the next check past the window re-offers.
});

ipcMain.handle(UPDATE_CHANNELS.restart, () => {
  const target = appImagePath();
  if (!target) return;
  // The default execPath is the /tmp FUSE mount, which is gone after exit.
  app.relaunch({ execPath: target });
  app.exit(0);
});

ipcMain.handle(UPDATE_CHANNELS.openReleasePage, () => shell.openExternal(RELEASES_PAGE_URL));
```

Match the settings-store accessor names already used in `main.ts` (read the file — do not assume `get`/`update` if it exposes different names).

- [ ] **Step 5: Run the contract test and the typechecker**

Run: `npx vitest run src/main/ipc-contract.test.ts && npm run typecheck`
Expected: PASS — every preload channel now has exactly one handler.

- [ ] **Step 6: Commit**

```bash
git add src/main/update-ipc.ts src/main/main.ts src/preload.ts
git commit -m "Wire the update service to the renderer"
```

---

### Task 7: The toast

Presentational only: it renders an `UpdateState` and emits actions. All sequencing lives in main.

**Files:**
- Create: `src/renderer/UpdateToast.tsx`
- Modify: `src/renderer/App.tsx` (render it; trigger the check after launch)
- Modify: `src/renderer/styles.css` (the `.update-toast` rules)
- Modify: `src/renderer/global.d.ts` (declare `window.update`)
- Test: `src/renderer/update-toast.test.ts`

Mockup (authoritative for layout and copy): <https://claude.ai/code/artifact/c24dc13a-a018-46de-80ca-53d7ec3758b3>

**Interfaces:**
- Consumes: `window.update` (Task 6), `UpdateState` (Task 5).
- Produces: `<UpdateToast state={state} onAction={...} />`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/update-toast.test.ts`. This codebase tests renderer logic by asserting on source text (see `styles-layout.test.ts` and `app-behavior.test.ts`) rather than mounting components — follow that convention:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const toast = readFileSync(new URL('./UpdateToast.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('update toast layout', () => {
  it('sits below modals and the startup tutorial so it can never cover a dialog', () => {
    // .modal-backdrop is 100 and .startup-tutorial-backdrop is 120.
    expect(rule('.update-toast')).toContain('z-index: 90');
  });

  it('shrinks instead of clipping at 150% UI scale or in a narrow window', () => {
    expect(rule('.update-toast')).toContain('min(348px, calc(100% - 32px))');
  });

  it('anchors to the bottom-right, clear of the top resize edge', () => {
    const declaration = rule('.update-toast');
    expect(declaration).toContain('position: fixed');
    expect(declaration).toContain('right: 16px');
    expect(declaration).toContain('bottom: 16px');
  });

  it('respects reduced motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('update toast behaviour', () => {
  it('offers exactly the three actions', () => {
    expect(toast).toContain('Update');
    expect(toast).toContain('Remind me later');
    expect(toast).toContain('Skip this version');
  });

  it('never auto-dismisses, so the choice cannot be lost', () => {
    expect(toast).not.toMatch(/setTimeout\([^)]*dismiss/);
  });

  it('asks nothing during the install; the polkit prompt is the confirmation', () => {
    const installing = toast.slice(toast.indexOf("'installing'"));
    expect(installing.slice(0, 600)).not.toContain('<button');
  });

  it('is suppressed while a modal or the startup tutorial is open', () => {
    expect(app).toMatch(/updateState[\s\S]{0,400}(showTutorial|modal)/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/renderer/update-toast.test.ts`
Expected: FAIL — `UpdateToast.tsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/renderer/UpdateToast.tsx`:

```tsx
import type { UpdateState } from '../main/update-service';

export type UpdateAction = 'start' | 'dismiss' | 'skip' | 'restart' | 'openReleasePage';

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function UpdateToast({
  state,
  onAction,
}: {
  state: UpdateState;
  onAction: (action: UpdateAction) => void;
}): JSX.Element | null {
  if (state.phase === 'idle') return null;

  return (
    <div className="update-toast" role="dialog" aria-label="Update">
      {state.phase === 'offer' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph">↑</div>
            <div>
              <p className="update-toast-title">Update available</p>
              <p className="update-toast-sub">
                {state.version} · you&rsquo;re on {__APP_VERSION__} · {megabytes(state.sizeBytes)}
              </p>
            </div>
          </div>
          {state.notes.trim().length > 0 && (
            <details className="update-toast-notes">
              <summary>What&rsquo;s new</summary>
              <p>{state.notes}</p>
            </details>
          )}
          <div className="update-toast-actions">
            <button type="button" className="primary" onClick={() => onAction('start')}>
              Update
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              Remind me later
            </button>
            <button type="button" className="quiet" onClick={() => onAction('skip')}>
              Skip this version
            </button>
          </div>
        </>
      )}

      {state.phase === 'downloading' && (
        <ProgressCard
          title={`Updating to ${state.version}`}
          sub={`Downloading… ${megabytes(state.received)} of ${megabytes(state.total)}`}
          percent={state.total > 0 ? (state.received / state.total) * 100 : 0}
        />
      )}

      {state.phase === 'verifying' && (
        <ProgressCard
          title={`Updating to ${state.version}`}
          sub="Verifying the download…"
          percent={100}
        />
      )}

      {state.phase === 'installing' && (
        <ProgressCard
          title={`Installing ${state.version}`}
          sub={state.step}
          percent={((state.index + 1) / state.total) * 100}
        />
      )}

      {state.phase === 'restart' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph ok">✓</div>
            <div>
              <p className="update-toast-title">Update ready</p>
              <p className="update-toast-sub">{state.version} installed. Restart to finish.</p>
            </div>
          </div>
          <div className="update-toast-actions">
            <button type="button" className="primary" onClick={() => onAction('restart')}>
              Restart now
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              On next launch
            </button>
          </div>
        </>
      )}

      {state.phase === 'failed' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph warn">!</div>
            <div>
              <p className="update-toast-title">Update failed</p>
              <p className="update-toast-sub">{state.message}</p>
            </div>
          </div>
          <div className="update-toast-actions">
            <button type="button" className="primary" onClick={() => onAction('start')}>
              Try again
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              Later
            </button>
          </div>
        </>
      )}

      {state.phase === 'readonly' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph warn">!</div>
            <div>
              <p className="update-toast-title">Update available — {state.version}</p>
              <p className="update-toast-sub">
                OpenDS5 can&rsquo;t replace itself in a read-only folder. Download it and swap the
                file yourself.
              </p>
            </div>
          </div>
          <div className="update-toast-actions">
            <button
              type="button"
              className="primary"
              onClick={() => onAction('openReleasePage')}
            >
              Open download page
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              Later
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProgressCard({
  title,
  sub,
  percent,
}: {
  title: string;
  sub: string;
  percent: number;
}): JSX.Element {
  return (
    <>
      <div className="update-toast-head">
        <div className="update-toast-glyph">↑</div>
        <div>
          <p className="update-toast-title">{title}</p>
          <p className="update-toast-sub">{sub}</p>
        </div>
      </div>
      <div className="update-toast-bar">
        <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </>
  );
}
```

`__APP_VERSION__` is the version the app already displays — read `App.tsx` and reuse whatever it uses today (a `bridge.getVersion()` call or a Vite define). Do not invent a new mechanism.

- [ ] **Step 4: Add the styles**

Append to `src/renderer/styles.css`, using the existing theme custom properties rather than hard-coded colors:

```css
.update-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 90;
  width: min(348px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 15px;
  border: 1px solid var(--card-border);
  border-radius: 11px;
  background: var(--card-bg);
  box-shadow: var(--shadow-menu);
  animation: update-toast-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes update-toast-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .update-toast {
    animation: none;
  }
}

.update-toast-head {
  display: flex;
  gap: 11px;
  align-items: flex-start;
}

.update-toast-glyph {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-weight: 700;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.update-toast-glyph.ok {
  color: var(--ok, #35d07f);
  background: color-mix(in srgb, var(--ok, #35d07f) 14%, transparent);
}

.update-toast-glyph.warn {
  color: var(--warn, #f0a541);
  background: color-mix(in srgb, var(--warn, #f0a541) 14%, transparent);
}

.update-toast-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 620;
}

.update-toast-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.update-toast-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Skipping is the most consequential choice, so it is the hardest to hit by reflex. */
.update-toast-actions .quiet {
  margin-left: auto;
  border-color: transparent;
  background: none;
  color: var(--text-muted);
}

.update-toast-bar {
  height: 5px;
  border-radius: 99px;
  background: var(--track-bg);
  overflow: hidden;
}

.update-toast-bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 200ms linear;
}
```

Check the real custom-property names in `styles.css` before committing — use the ones the file already defines (`--card-bg`, `--text-muted`, etc.) and add `--ok` / `--warn` to each theme block if no equivalent exists.

- [ ] **Step 5: Trigger the check in App.tsx**

Add to `App.tsx`, gated so it never fires while the startup tutorial or a modal is showing:

```tsx
const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' });

useEffect(() => window.update.onState(setUpdateState), []);

useEffect(() => {
  if (showStartupTutorial) return;
  // Let the launch animation settle before anything appears.
  const timer = setTimeout(() => {
    void window.update.check().then(setUpdateState);
  }, 1000);
  return () => clearTimeout(timer);
}, [showStartupTutorial]);
```

Render it last inside the shell, and suppress it while a modal is open:

```tsx
{!showStartupTutorial && !isModalOpen && (
  <UpdateToast
    state={updateState}
    onAction={(action) => {
      if (action === 'skip' && 'version' in updateState) {
        void window.update.skip(updateState.version);
        setUpdateState({ phase: 'idle' });
        return;
      }
      if (action === 'dismiss') {
        void window.update.dismiss();
        setUpdateState({ phase: 'idle' });
        return;
      }
      void window.update[action]();
    }}
  />
)}
```

Use the real names for the tutorial and modal flags that `App.tsx` already has — read the file; do not introduce new state for this.

Declare the API in `src/renderer/global.d.ts` beside the existing `bridge` and `setup` declarations:

```ts
import type { UpdateApi } from '../preload';

declare global {
  interface Window {
    update: UpdateApi;
  }
}
```

- [ ] **Step 6: Run the tests and the typechecker**

Run: `npx vitest run src/renderer/update-toast.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/UpdateToast.tsx src/renderer/update-toast.test.ts \
  src/renderer/App.tsx src/renderer/styles.css src/renderer/global.d.ts
git commit -m "Offer the update in a toast that never blocks the app"
```

---

### Task 8: Publish the checksum

Without this asset the updater will never offer anything — `decideUpdate` requires a `.sha256` alongside the AppImage. This task is what makes the feature live.

**Files:**
- Modify: `.github/workflows/release.yml` (after "verify static-fuse3 runtime", before "publish release")

- [ ] **Step 1: Add the checksum step**

Insert after the `verify static-fuse3 runtime` step:

```yaml
      # The updater refuses to install an AppImage it cannot verify, so the
      # checksum ships as a release asset beside it.
      - name: checksum AppImage
        working-directory: ds5-bridge/companion
        run: |
          appimage="$(find artifacts/installer -maxdepth 1 -name '*.AppImage' -print -quit)"
          [ -n "$appimage" ] || { echo "no AppImage produced"; exit 1; }
          ( cd "$(dirname "$appimage")" && sha256sum "$(basename "$appimage")" > "$(basename "$appimage").sha256" )
          cat "${appimage}.sha256"
```

- [ ] **Step 2: Publish it**

Change the `gh release create` argument list in the `publish release` step so both assets upload:

```yaml
            ds5-bridge/companion/artifacts/installer/*.AppImage \
            ds5-bridge/companion/artifacts/installer/*.AppImage.sha256
```

- [ ] **Step 3: Verify the checksum line format locally**

The updater parses `<hex>  <filename>`. Confirm against a real artifact:

```bash
cd ds5-bridge/companion/artifacts/installer
sha256sum OpenDS5-Companion-Setup-1.7.0.AppImage
```

Expected: a 64-character hex digest, two spaces, then the filename — which is what `parseSha256Asset` splits on.

- [ ] **Step 4: Commit**

```bash
git add ../../.github/workflows/release.yml
git commit -m "Publish a checksum beside the AppImage so updates can be verified"
```

---

### Task 9: Full suite and manual verification

- [ ] **Step 1: Run everything**

Run: `npm run test:companion && npm run typecheck`
Expected: PASS, including the pre-existing `ipc-contract.test.ts` and `styles-layout.test.ts`.

- [ ] **Step 2: Verify on a real AppImage, not the dev build**

The updater is disabled under `npm run dev` (`APPIMAGE` is unset), so a dev run proves nothing. Build and run the real thing:

```bash
npm run installer:linux
cp artifacts/installer/OpenDS5-Companion-Setup-*.AppImage ~/AppImages/opends5-test.AppImage
~/AppImages/opends5-test.AppImage
```

Confirm, with the app's version temporarily set below the latest published release so a real update is offered:
1. The toast appears about a second after the window, bottom-right, covering no control.
2. It does **not** appear if the startup tutorial is showing.
3. "Skip this version" makes it stay away on the next launch; a later version still offers.
4. "Update" runs download → verify → (installing) → restart, and the relaunched app reports the new version.

- [ ] **Step 3: Commit any fixes and open the PR**

```bash
git push -u origin feature/update-backend
gh pr create --base main --title "Update backend" --body "Implements docs/superpowers/specs/2026-07-14-update-backend-design.md"
```

---

## Self-Review

**Spec coverage:** GitHub Releases source → Task 3. Prerelease/draft filtering → Task 2. Two-day gate → Task 5 (`isCheckDue`) + Task 6 (persisted). Three actions → Tasks 6, 7. Toast UI, z-index, scaling → Task 7. Download/verify/atomic swap/read-only probe → Task 4. `modinfo` module-version check and automatic install → Task 5. Relaunch with `execPath` → Task 6. `.sha256` asset → Task 8. Settings fields → Task 1. Error handling → the `failed` phase in Task 5 plus silent-null in Task 3. Manual AppImage verification → Task 9. No gaps.

**Type consistency:** `UpdateState` is defined once in Task 5 and consumed by Tasks 6 and 7. `Release`/`ReleaseAsset` are defined in Task 2 and consumed by Task 3. `UPDATE_CHANNELS` is defined in Task 6 and used by both main and preload. Asset lookup uses `.AppImage` / `.AppImage.sha256` suffixes consistently in Tasks 2, 4 and 8.

**Known soft spots the implementer must resolve by reading, not guessing:** the settings-store accessor names in `main.ts` (Task 6, Step 4), the existing app-version mechanism in `App.tsx` (Task 7, Step 3), the tutorial/modal flag names (Task 7, Step 5), and the real CSS custom-property names (Task 7, Step 4). Each is flagged inline.
