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

// index.json is generated, and native.json is a curated list of games that drive their
// own triggers -- neither is a profile, so neither goes through the profile validator.
const NON_PROFILE_FILES = new Set(['index.json', 'native.json']);

const profileFiles = readdirSync(libraryDir)
  .filter((name) => name.endsWith('.json') && !NON_PROFILE_FILES.has(name))
  .sort();

// Validate every profile through the shared validator, which also returns each
// profile's derived capability line. stdout carries the derived JSON; errors go
// to stderr, so pipe stderr through and capture stdout.
const validation = spawnSync(
  'npx',
  ['--yes', 'tsx', validatorPath, ...profileFiles.map((name) => join(libraryDir, name))],
  { cwd: companionDir, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }
);
if (validation.status !== 0) {
  fail('build-index: one or more profiles failed validation (see errors above).');
}

let derived;
try {
  derived = JSON.parse(validation.stdout);
} catch {
  fail('build-index: could not parse derived profile data from validate-profile.');
}

// Build the index from each profile's name + meta, plus the derived capability line.
// A profile with no tier is community: an unlabelled profile must never publish itself
// as maintainer-verified.
const index = profileFiles.map((file) => {
  const fullPath = join(libraryDir, file);
  const profile = JSON.parse(readFileSync(fullPath, 'utf8'));
  const meta = profile.meta ?? {};
  const capabilities = derived[fullPath]?.capabilities;
  if (typeof capabilities !== 'string') {
    fail(`build-index: no derived capabilities for ${file}.`);
  }
  return {
    file,
    name: profile.name,
    game: meta.game ?? '',
    author: meta.author ?? '',
    description: meta.description ?? '',
    capabilities,
    tier: meta.tier === 'verified' ? 'verified' : 'community',
    ...(meta.origin ? { origin: meta.origin } : {})
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
