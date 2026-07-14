import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
