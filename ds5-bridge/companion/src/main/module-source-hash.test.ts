import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleSourceHash } from './module-source-hash';

let dir: string;

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(dir, 'mod-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opends5-hash-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('moduleSourceHash', () => {
  const base = { 'vds_hcd.c': 'int main;', 'include/vds.h': '#pragma once' };

  it('hashes identical trees identically, regardless of creation order', () => {
    expect(moduleSourceHash(tree(base))).toBe(moduleSourceHash(tree(base)));
  });

  it('changes when a byte of source changes', () => {
    const changed = { ...base, 'vds_hcd.c': 'int main; // fix' };
    expect(moduleSourceHash(tree(changed))).not.toBe(moduleSourceHash(tree(base)));
  });

  it('changes when a file is added', () => {
    const added = { ...base, 'extra.c': '' };
    expect(moduleSourceHash(tree(added))).not.toBe(moduleSourceHash(tree(base)));
  });

  it('changes when a file is renamed but its contents are not', () => {
    const renamed = { 'vds_hcd_v2.c': 'int main;', 'include/vds.h': '#pragma once' };
    expect(moduleSourceHash(tree(renamed))).not.toBe(moduleSourceHash(tree(base)));
  });

  it('returns an empty hash for a missing directory', () => {
    expect(moduleSourceHash(path.join(dir, 'nope'))).toBe('');
  });

  it('returns an empty hash for an existing but empty directory', () => {
    expect(moduleSourceHash(tree({}))).toBe('');
  });

  it('ignores the generated PACKAGE_VERSION stamp in dkms.conf', () => {
    const conf = (version: string) =>
      `PACKAGE_NAME="vds_hcd"\nPACKAGE_VERSION="${version}"\nBUILT_MODULE_NAME[0]="vds_hcd"\n`;
    expect(moduleSourceHash(tree({ ...base, 'dkms.conf': conf('1.7.0') }))).toBe(
      moduleSourceHash(tree({ ...base, 'dkms.conf': conf('1.8.0') }))
    );
  });

  it('changes when a non-version line of dkms.conf changes', () => {
    const original = 'PACKAGE_VERSION="1.7.0"\nBUILT_MODULE_NAME[0]="vds_hcd"\n';
    const edited = 'PACKAGE_VERSION="1.7.0"\nBUILT_MODULE_NAME[0]="vds_hcd2"\n';
    expect(moduleSourceHash(tree({ ...base, 'dkms.conf': edited }))).not.toBe(
      moduleSourceHash(tree({ ...base, 'dkms.conf': original }))
    );
  });

  it('does not confuse a path boundary for file contents', () => {
    const split = tree({ 'a.c': 'AAA', 'b.c': 'BBB' });
    const merged = tree({ 'a.c': 'AAAb.c\0BBB' });
    expect(moduleSourceHash(split)).not.toBe(moduleSourceHash(merged));
  });

  it('is stable when readdir returns entries in a different order', () => {
    const root = tree({ ...base, 'zzz.c': 'z', 'aaa.c': 'a' });
    const expected = moduleSourceHash(root);

    const real = fs.readdirSync.bind(fs);
    vi.spyOn(fs, 'readdirSync').mockImplementation(((p: never, o: never) =>
      (real(p, o) as unknown[]).reverse()) as typeof fs.readdirSync);

    expect(moduleSourceHash(root)).toBe(expected);
  });

  it('returns an empty hash when the root is a file, not a directory', () => {
    const file = path.join(dir, 'not-a-dir');
    fs.writeFileSync(file, 'x');
    expect(moduleSourceHash(file)).toBe('');
  });

  it('returns an empty hash when a file cannot be read', () => {
    const root = tree(base);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });
    expect(moduleSourceHash(root)).toBe('');
  });
});
