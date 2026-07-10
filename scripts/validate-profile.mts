// Validation harness for repo library profiles.
//
// Invoked by scripts/build-index.mjs via `npx tsx` from inside
// ds5-bridge/companion (where the TypeScript devDependency lives) so we can
// import the real shared validator instead of duplicating its rules.
//
// Usage: npx tsx <this> <profile.json> [<profile.json> ...]
// Prints "<path>: <error>" for each invalid profile and exits 1 if any fail.
import { readFileSync } from 'node:fs';
import { validateTriggerProfile } from '../ds5-bridge/companion/src/shared/trigger-profiles.ts';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('validate-profile: no profile files given');
  process.exit(1);
}

let failed = false;
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
  }
}

process.exit(failed ? 1 : 0);
