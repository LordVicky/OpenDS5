#!/usr/bin/env bash
# Minimal test harness: no dependencies, used by all installer tests.
set -u
FAILURES=0
TESTS=0
assert_eq() { # expected actual label
  TESTS=$((TESTS + 1))
  if [ "$1" = "$2" ]; then
    printf 'ok   %s\n' "$3"
  else
    printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$3" "$1" "$2"
    FAILURES=$((FAILURES + 1))
  fi
}
assert_contains() { # haystack needle label
  TESTS=$((TESTS + 1))
  case "$1" in
    *"$2"*) printf 'ok   %s\n' "$3" ;;
    *)
      printf 'FAIL %s\n  missing:  %s\n  in:       %s\n' "$3" "$2" "$1"
      FAILURES=$((FAILURES + 1))
      ;;
  esac
}
finish() {
  printf '%d tests, %d failures\n' "$TESTS" "$FAILURES"
  [ "$FAILURES" -eq 0 ]
}
