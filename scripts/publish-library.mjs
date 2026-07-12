#!/usr/bin/env node
// Publishes profiles/library/ to the public OpenDS5-Profiles mirror.
//
//   node scripts/publish-library.mjs            publish if there are changes
//   node scripts/publish-library.mjs --dry-run  show what would be published
//
// This repo is private, and raw.githubusercontent.com only serves public repos
// anonymously, so the app cannot fetch the library from here. Profiles are
// authored and validated in this repo (scripts/build-index.mjs runs the real
// shared validator), then the resulting JSON is mirrored to the public repo,
// which the app reads via LIBRARY_INDEX_URL.
//
// Only profiles/library/*.json is ever copied. Nothing else in this repo may
// reach the public mirror.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIRROR_REMOTE = 'https://github.com/LordVicky/OpenDS5-Profiles.git';
const MIRROR_BRANCH = 'main';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const libraryDir = join(repoRoot, 'profiles', 'library');

const dryRun = process.argv.includes('--dry-run');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    console.error(`publish-library: \`${cmd} ${args.join(' ')}\` failed.`);
    process.exit(1);
  }
  return result;
}

// Never publish profiles the app itself would reject.
run('node', [join(scriptDir, 'build-index.mjs'), '--check']);

const work = mkdtempSync(join(tmpdir(), 'opends5-profiles-'));
try {
  run('git', ['clone', '--depth', '1', '--branch', MIRROR_BRANCH, MIRROR_REMOTE, work], {
    stdio: 'ignore'
  });

  // Replace the mirror's library wholesale so deletions propagate too.
  const mirrorLibrary = join(work, 'profiles', 'library');
  rmSync(mirrorLibrary, { recursive: true, force: true });
  cpSync(libraryDir, mirrorLibrary, { recursive: true });

  const status = spawnSync('git', ['status', '--porcelain'], { cwd: work, encoding: 'utf8' });
  if (!status.stdout.trim()) {
    console.log('publish-library: mirror is already up to date.');
    process.exit(0);
  }

  const count = readdirSync(libraryDir).filter((f) => f !== 'index.json').length;
  console.log(`publish-library: changes to publish (${count} profile(s)):`);
  console.log(status.stdout.trimEnd());

  if (dryRun) {
    console.log('publish-library: --dry-run, not pushing.');
    process.exit(0);
  }

  run('git', ['add', '-A'], { cwd: work });
  run('git', ['commit', '-m', `Publish profiles library (${count} profile(s))`], { cwd: work });
  run('git', ['push', 'origin', MIRROR_BRANCH], { cwd: work });
  console.log(`publish-library: pushed to ${MIRROR_REMOTE} (${MIRROR_BRANCH}).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
