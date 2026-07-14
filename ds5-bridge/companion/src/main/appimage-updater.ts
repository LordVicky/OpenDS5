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
    // Close must not be able to skip the rm, nor replace the original error.
    try {
      await handle.close();
    } catch {
      /* ignore */
    }
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }
  // Flush before the rename can publish this file, so a power loss cannot
  // install a partially-materialized AppImage.
  await handle.sync();
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
