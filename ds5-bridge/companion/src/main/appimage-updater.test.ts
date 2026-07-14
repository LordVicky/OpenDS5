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
