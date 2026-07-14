#!/usr/bin/env node
// Keeps the OpenDS5-Profiles repo's vendored validator identical to this repo's.
//
//   node scripts/sync-validator.mjs            push the current validator to OpenDS5-Profiles
//   node scripts/sync-validator.mjs --dry-run  show what would change
//   node scripts/sync-validator.mjs --check    exit 1 if the published copy has drifted
//
// Profiles are contributed to the public OpenDS5-Profiles repo, whose CI validates each one
// before merge. For that gate to mean anything it has to run the *app's* validator, so the three
// files below are vendored there verbatim under validator/. Two copies can drift, and a drifted
// copy would admit profiles the app then rejects at install time -- so CI runs --check, and the
// app's schema cannot silently diverge from the CI gating contributions.
//
// The files are copied verbatim rather than hand-extracted, which is what lets --check be an exact
// comparison. trigger-profiles.ts and profile-capabilities.ts import only *types* from protocol.ts,
// so vendoring these three pulls in no other runtime code.
//
// --check reads the published copies over HTTPS (the repo is public), so CI needs no token.
// Pushing clones and pushes with the maintainer's own git credentials, so no cross-repo token has
// to exist anywhere.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILES_REMOTE = 'https://github.com/LordVicky/OpenDS5-Profiles.git';
const PROFILES_BRANCH = 'main';
const RAW_BASE =
  'https://raw.githubusercontent.com/LordVicky/OpenDS5-Profiles/main/validator';
const COMMIT_NAME = 'LordVicky';
const COMMIT_EMAIL = 'sreevicky1001@gmail.com';

// The complete set the profiles repo's CI needs to run the real validator.
const VALIDATOR_FILES = ['trigger-profiles.ts', 'profile-capabilities.ts', 'protocol.ts'];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const sharedDir = join(repoRoot, 'ds5-bridge', 'companion', 'src', 'shared');

const checkMode = process.argv.includes('--check');
const dryRun = process.argv.includes('--dry-run');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    console.error(`sync-validator: \`${cmd} ${args.join(' ')}\` failed.`);
    process.exit(1);
  }
  return result;
}

function localSource(file) {
  return readFileSync(join(sharedDir, file), 'utf8');
}

if (checkMode) {
  const drifted = [];
  for (const file of VALIDATOR_FILES) {
    const response = await fetch(`${RAW_BASE}/${file}`);
    if (!response.ok) {
      console.error(
        `sync-validator: could not read published validator/${file} (HTTP ${response.status}).`
      );
      process.exit(1);
    }
    if ((await response.text()) !== localSource(file)) drifted.push(file);
  }

  if (drifted.length > 0) {
    console.error(
      'sync-validator: the validator published to OpenDS5-Profiles has drifted from this repo.\n' +
        `${drifted.map((file) => `  ${file}`).join('\n')}\n` +
        'Its CI would gate contributions on stale rules. Run `node scripts/sync-validator.mjs`.'
    );
    process.exit(1);
  }

  console.log(`sync-validator: published validator matches (${VALIDATOR_FILES.length} files).`);
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'opends5-validator-'));
try {
  run('git', ['clone', '--depth', '1', '--branch', PROFILES_BRANCH, PROFILES_REMOTE, work], {
    stdio: 'ignore'
  });

  for (const file of VALIDATOR_FILES) {
    copyFileSync(join(sharedDir, file), join(work, 'validator', file));
  }

  const status = spawnSync('git', ['status', '--porcelain'], { cwd: work, encoding: 'utf8' });
  if (!status.stdout.trim()) {
    console.log('sync-validator: published validator is already up to date.');
    process.exit(0);
  }

  console.log('sync-validator: changes to publish:');
  console.log(status.stdout.trimEnd());

  if (dryRun) {
    console.log('sync-validator: --dry-run, not pushing.');
    process.exit(0);
  }

  run('git', ['add', '-A'], { cwd: work });
  // The temp clone inherits no identity when the user has no global git config, so commit with an
  // explicit one rather than failing at the last step.
  run(
    'git',
    [
      '-c',
      `user.name=${COMMIT_NAME}`,
      '-c',
      `user.email=${COMMIT_EMAIL}`,
      'commit',
      '-m',
      'chore: sync validator from OpenDS5'
    ],
    { cwd: work }
  );
  run('git', ['push', 'origin', PROFILES_BRANCH], { cwd: work });
  console.log(`sync-validator: pushed to ${PROFILES_REMOTE} (${PROFILES_BRANCH}).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
