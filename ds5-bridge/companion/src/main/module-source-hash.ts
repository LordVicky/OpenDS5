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
 * Identifies the driver sources the app is carrying, so the installer only runs
 * when they actually changed. Gating on the app version instead would prompt for
 * a password on every release, since dkms.conf is stamped from package.json.
 */
export function moduleSourceHash(root: string): string {
  if (!fs.existsSync(root)) return '';
  const files: string[] = [];
  walk(root, root, files);
  files.sort();

  const hash = createHash('sha256');
  for (const relative of files) {
    // Hash the path as well as the bytes, so a pure rename is still a change.
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, relative)));
  }
  return hash.digest('hex');
}
