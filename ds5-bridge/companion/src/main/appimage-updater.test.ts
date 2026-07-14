import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canSelfReplace,
  downloadTo,
  parseSha256Asset,
  sha256File,
  swapInPlace,
} from './appimage-updater';

function fakeFetch(
  body: AsyncIterable<Uint8Array> | null,
  init: { ok?: boolean; status?: number; total?: number } = {},
): typeof fetch {
  const { ok = true, status = 200, total = 0 } = init;
  return (async () =>
    ({
      ok,
      status,
      body,
      headers: { get: () => String(total) },
    }) as unknown as Response) as unknown as typeof fetch;
}

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
    const hex = 'a'.repeat(64);
    expect(parseSha256Asset(`${hex}  OpenDS5-Companion-Setup-1.8.0.AppImage\n`)).toBe(hex);
  });

  it('rejects a body that is not a 64-hex digest', () => {
    expect(parseSha256Asset('<!DOCTYPE html><html><body>404</body></html>')).toBe('');
    expect(parseSha256Asset('abc123  OpenDS5.AppImage\n')).toBe('');
    expect(parseSha256Asset(`${'a'.repeat(65)}  OpenDS5.AppImage`)).toBe('');
    expect(parseSha256Asset('   ')).toBe('');
  });
});

describe('downloadTo', () => {
  it('writes the downloaded bytes and reports progress', async () => {
    const tempPath = path.join(dir, 'OpenDS5.AppImage.download');
    const chunks = [Buffer.from('hello '), Buffer.from('world')];
    const progress: Array<[number, number]> = [];

    await downloadTo({
      url: 'https://example.invalid/x',
      tempPath,
      onProgress: (received, total) => progress.push([received, total]),
      fetchImpl: fakeFetch(
        (async function* () {
          yield* chunks;
        })(),
        { total: 11 },
      ),
    });

    expect(fs.readFileSync(tempPath, 'utf8')).toBe('hello world');
    expect(progress).toEqual([
      [6, 11],
      [11, 11],
    ]);
  });

  it('leaves no temp file behind when the stream fails partway', async () => {
    const tempPath = path.join(dir, 'OpenDS5.AppImage.download');

    await expect(
      downloadTo({
        url: 'https://example.invalid/x',
        tempPath,
        onProgress: () => {},
        fetchImpl: fakeFetch(
          (async function* () {
            yield Buffer.from('partial');
            throw new Error('stream reset');
          })(),
          { total: 999 },
        ),
      }),
    ).rejects.toThrow('stream reset');

    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('leaves no temp file behind when the fsync fails', async () => {
    const tempPath = path.join(dir, 'OpenDS5.AppImage.download');
    const open = fs.promises.open;
    const spy = vi
      .spyOn(fs.promises, 'open')
      .mockImplementation(async (...args: Parameters<typeof open>) => {
        const handle = await open(...args);
        // Simulates ENOSPC surfacing at fsync: the bytes streamed fine, but the
        // flush to disk failed.
        handle.sync = async () => {
          throw new Error('ENOSPC: no space left on device, fsync');
        };
        return handle;
      });

    try {
      await expect(
        downloadTo({
          url: 'https://example.invalid/x',
          tempPath,
          onProgress: () => {},
          fetchImpl: fakeFetch(
            (async function* () {
              yield Buffer.from('hello world');
            })(),
            { total: 11 },
          ),
        }),
      ).rejects.toThrow('ENOSPC');
    } finally {
      spy.mockRestore();
    }

    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('aborts and leaves no temp file when the download stalls', async () => {
    const tempPath = path.join(dir, 'OpenDS5.AppImage.download');
    const stalling: typeof fetch = (async (_url: string, init: { signal: AbortSignal }) =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => '999' },
        body: (async function* () {
          yield Buffer.from('first');
          // Then nothing ever arrives, until the stall timer aborts us.
          await new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
          });
        })(),
      }) as unknown as Response) as unknown as typeof fetch;

    await expect(
      downloadTo({
        url: 'https://example.invalid/x',
        tempPath,
        onProgress: () => {},
        fetchImpl: stalling,
        stallTimeoutMs: 50,
      }),
    ).rejects.toThrow('download stalled');

    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('does not abort a slow download that keeps making progress', async () => {
    // Ten 20ms-apart chunks: ~200ms total, far past the 50ms budget, but no single
    // gap reaches it. A total-duration cap would kill this; a stall timeout must not.
    const tempPath = path.join(dir, 'OpenDS5.AppImage.download');

    await downloadTo({
      url: 'https://example.invalid/x',
      tempPath,
      onProgress: () => {},
      fetchImpl: fakeFetch(
        (async function* () {
          for (let i = 0; i < 10; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            yield Buffer.from('.');
          }
        })(),
        { total: 10 },
      ),
      stallTimeoutMs: 50,
    });

    expect(fs.readFileSync(tempPath, 'utf8')).toBe('..........');
  });

  it('rejects a non-ok response without creating a temp file', async () => {
    const tempPath = path.join(dir, 'OpenDS5.AppImage.download');
    await expect(
      downloadTo({
        url: 'https://example.invalid/x',
        tempPath,
        onProgress: () => {},
        fetchImpl: fakeFetch(null, { ok: false, status: 404 }),
      }),
    ).rejects.toThrow('download failed (404)');
    expect(fs.existsSync(tempPath)).toBe(false);
  });
});

describe('swapInPlace', () => {
  it('replaces the target atomically and marks it executable', () => {
    const target = path.join(dir, 'OpenDS5.AppImage');
    const temp = path.join(dir, 'OpenDS5.AppImage.download');
    fs.writeFileSync(target, 'old');
    fs.writeFileSync(temp, 'new');

    const tempIno = fs.statSync(temp).ino;
    const targetIno = fs.statSync(target).ino;

    swapInPlace(temp, target);

    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.existsSync(temp)).toBe(false);
    expect(fs.statSync(target).mode & 0o111).toBeTruthy();
    // Only a rename() moves the temp's inode onto the target path. A
    // copy-into-target implementation would keep the target's original inode.
    expect(fs.statSync(target).ino).toBe(tempIno);
    expect(fs.statSync(target).ino).not.toBe(targetIno);
  });

  it('leaves an already-open fd on the old target reading the old bytes', () => {
    const target = path.join(dir, 'OpenDS5.AppImage');
    const temp = path.join(dir, 'OpenDS5.AppImage.download');
    fs.writeFileSync(target, 'old');
    fs.writeFileSync(temp, 'new');

    // The running AppImage holds exactly such an fd on its own inode.
    const fd = fs.openSync(target, 'r');
    try {
      swapInPlace(temp, target);

      const buf = Buffer.alloc(3);
      const read = fs.readSync(fd, buf, 0, 3, 0);
      expect(buf.subarray(0, read).toString('utf8')).toBe('old');
    } finally {
      fs.closeSync(fd);
    }

    expect(fs.readFileSync(target, 'utf8')).toBe('new');
  });

  it('removes the temp file when the rename fails', () => {
    const target = path.join(dir, 'sub', 'OpenDS5.AppImage'); // 'sub' does not exist
    const temp = path.join(dir, 'OpenDS5.AppImage.download');
    fs.writeFileSync(temp, 'new');

    expect(() => swapInPlace(temp, target)).toThrow();
    expect(fs.existsSync(temp)).toBe(false);
  });

  it('leaves the installed version alone when the swap fails', () => {
    const target = path.join(dir, 'OpenDS5.AppImage');
    fs.writeFileSync(target, 'old');
    expect(() => swapInPlace(path.join(dir, 'missing'), target)).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('old');
  });
});
