#!/usr/bin/env node
// Builds profiles/library/index.json from the *.json profiles in
// profiles/library/, after validating each one against the shared
// TriggerProfile validator.
//
//   node scripts/build-index.mjs          rewrites index.json
//   node scripts/build-index.mjs --check  exits 1 if index.json is stale
//                                         or any profile is invalid
//
// Validation is delegated to scripts/validate-profile.mts, which imports the
// real shared validator (ds5-bridge/companion/src/shared/trigger-profiles.ts).
// We run it through `npx tsx` from the companion directory, where the
// TypeScript toolchain devDependency lives, so the check exercises the exact
// same rules the app enforces at install time.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const libraryDir = join(repoRoot, 'profiles', 'library');
const indexPath = join(libraryDir, 'index.json');
const companionDir = join(repoRoot, 'ds5-bridge', 'companion');
const validatorPath = join(scriptDir, 'validate-profile.mts');

const checkMode = process.argv.includes('--check');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const profileFiles = readdirSync(libraryDir)
  .filter((name) => name.endsWith('.json') && name !== 'index.json')
  .sort();

// Validate every profile through the shared validator.
const validation = spawnSync(
  'npx',
  ['--yes', 'tsx', validatorPath, ...profileFiles.map((name) => join(libraryDir, name))],
  { cwd: companionDir, stdio: 'inherit' }
);
if (validation.status !== 0) {
  fail('build-index: one or more profiles failed validation (see errors above).');
}

// Build the index from each profile's name + meta.
const index = profileFiles.map((file) => {
  const profile = JSON.parse(readFileSync(join(libraryDir, file), 'utf8'));
  const meta = profile.meta ?? {};
  return {
    file,
    name: profile.name,
    game: meta.game ?? '',
    author: meta.author ?? '',
    description: meta.description ?? ''
  };
});

const serialized = `${JSON.stringify(index, null, 2)}\n`;

if (checkMode) {
  let current = null;
  try {
    current = readFileSync(indexPath, 'utf8');
  } catch {
    current = null;
  }
  if (current !== serialized) {
    fail(
      'build-index: index.json is out of sync with profiles/library/*.json.\n' +
        'Run `node scripts/build-index.mjs` and commit the result.'
    );
  }
  console.log('build-index: index.json is in sync and all profiles are valid.');
  process.exit(0);
}

writeFileSync(indexPath, serialized);
console.log(`build-index: wrote ${indexPath} (${index.length} profile(s)).`);
