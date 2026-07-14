import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function walk(root: string, dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, out);
    else if (entry.isFile()) out.push(path.relative(root, full));
  }
}

/**
 * dkms.conf's PACKAGE_VERSION is generated, not authored: electron-builder's
 * afterPack stamps it from package.json, so it changes on every release even
 * when the driver does not. Hashing it would make a UI-only update prompt for a
 * password. Flatten that one line to a constant; every other line of dkms.conf
 * (MAKE, BUILT_MODULE_NAME, ...) is a real driver change and must still count.
 */
function contentsFor(root: string, relative: string): Buffer {
  const raw = fs.readFileSync(path.join(root, relative));
  if (path.basename(relative) !== 'dkms.conf') return raw;
  return Buffer.from(
    raw.toString('utf8').replace(/^PACKAGE_VERSION=.*$/m, 'PACKAGE_VERSION="__hashed__"'),
    'utf8'
  );
}

export function moduleSourceHash(root: string): string {
  try {
    if (!fs.existsSync(root)) return '';
    const files: string[] = [];
    walk(root, root, files);
    files.sort();
    if (files.length === 0) return '';

    const hash = createHash('sha256');
    for (const relative of files) {
      const contents = contentsFor(root, relative);
      // Hash the path as well as the bytes, so a pure rename is still a change,
      // and frame the byte length so a path can never be confused for content
      // ({a: "AAA", b: "BBB"} must not collide with {a: "AAAb\0BBB"}).
      hash.update(relative);
      hash.update('\0');
      hash.update(String(contents.length));
      hash.update('\0');
      hash.update(contents);
    }
    return hash.digest('hex');
  } catch {
    // The contract is "a hash, or '' meaning stay inert" -- never throw into launch.
    return '';
  }
}
