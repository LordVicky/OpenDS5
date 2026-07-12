// Validation + description harness for repo library profiles.
//
// Invoked by scripts/build-index.mjs via `npx tsx` from inside
// ds5-bridge/companion (where the TypeScript devDependency lives) so we can
// import the real shared validator and the real capability describer instead of
// duplicating their rules. The index therefore describes each profile with the
// same code the app uses, and cannot drift from what the profile actually does.
//
// Usage: npx tsx <this> <profile.json> [<profile.json> ...]
// Errors go to stderr, one line per invalid profile; exits 1 if any fail.
// On success, prints a JSON object to stdout mapping each file path to its
// derived fields, which build-index.mjs bakes into index.json.
import { readFileSync } from 'node:fs';
import { describeCapabilities } from '../ds5-bridge/companion/src/shared/profile-capabilities.ts';
import { validateTriggerProfile } from '../ds5-bridge/companion/src/shared/trigger-profiles.ts';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('validate-profile: no profile files given');
  process.exit(1);
}

let failed = false;
const derived: Record<string, { capabilities: string }> = {};

for (const file of files) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`${file}: invalid JSON: ${(err as Error).message}`);
    failed = true;
    continue;
  }
  const result = validateTriggerProfile(raw);
  if (!result.ok) {
    console.error(`${file}: ${result.error}`);
    failed = true;
    continue;
  }
  derived[file] = { capabilities: describeCapabilities(result.profile) };
}

if (failed) process.exit(1);

process.stdout.write(JSON.stringify(derived));
