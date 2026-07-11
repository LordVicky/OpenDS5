#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rc=0
for t in test-*.sh; do
  echo "== $t"
  bash "$t" || rc=1
done
exit "$rc"
