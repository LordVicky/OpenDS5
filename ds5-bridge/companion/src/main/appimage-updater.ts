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

/** The AppImage is ~120MB: a slow-but-healthy link must not be killed. */
export const DOWNLOAD_STALL_TIMEOUT_MS = 60_000;

/** The temp file must be a sibling of the AppImage: rename() cannot cross filesystems. */
export function tempDownloadPath(target: string): string {
  return path.join(path.dirname(target), `.${path.basename(target)}.download`);
}

export async function downloadTo(opts: {
  url: string;
  tempPath: string;
  onProgress: (received: number, total: number) => void;
  fetchImpl?: typeof fetch;
  stallTimeoutMs?: number;
}): Promise<void> {
  const {
    url,
    tempPath,
    onProgress,
    fetchImpl = fetch,
    stallTimeoutMs = DOWNLOAD_STALL_TIMEOUT_MS,
  } = opts;

  // An inactivity deadline, NOT a total one: a 120MB download over a slow link is
  // healthy and must not be aborted, but a stalled one (captive portal, dead mirror)
  // would otherwise hang the toast in a phase that renders no cancel button. The
  // timer is armed before the request — headers can stall too — and reset per chunk.
  const controller = new AbortController();
  let stallTimer: NodeJS.Timeout | undefined;
  const armStallTimer = (): void => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(new Error('download stalled')), stallTimeoutMs);
  };

  try {
    armStallTimer();
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new Error(`download failed (${response.status})`);
    }
    const total = Number(response.headers.get('content-length') ?? 0);
    let received = 0;

    const handle = await fs.promises.open(tempPath, 'w');
    let closed = false;
    try {
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          armStallTimer();
          await handle.write(chunk);
          received += chunk.byteLength;
          onProgress(received, total);
        }
        // Flush before the rename can publish this file, so a power loss cannot
        // install a partially-materialized AppImage. ENOSPC/EIO surface here.
        await handle.sync();
        await handle.close();
        closed = true;
      } finally {
        // A failing close() must not replace the original error nor skip the rm,
        // so it is swallowed here and the outer catch still runs.
        if (!closed) {
          try {
            await handle.close();
            closed = true;
          } catch {
            /* ignore */
          }
        }
      }
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true });
      throw error;
    }
  } finally {
    clearTimeout(stallTimer);
  }
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

/**
 * A sha256sum line is "<hex>  <filename>". Anything else (an HTML 404 body, an
 * empty asset) yields '', which callers treat as "cannot verify → refuse".
 */
export function parseSha256Asset(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? '';
  return /^[0-9a-fA-F]{64}$/.test(first) ? first : '';
}

/**
 * Atomic same-filesystem replace. Safe while running: the AppImage runtime holds
 * an open fd on the old inode, so the mount stays valid until exit. Writing into
 * the running file instead of renaming over it would corrupt it.
 */
export function swapInPlace(tempPath: string, target: string): void {
  fs.chmodSync(tempPath, 0o755);
  try {
    fs.renameSync(tempPath, target);
  } catch (error) {
    // EXDEV/ENOSPC: the target is untouched, but the temp must not be left
    // sitting next to the AppImage.
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}
