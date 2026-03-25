# Common Bug Patterns

Use this file when the error message is vague or many files look suspicious.

## Data shape mismatch

Symptoms: `undefined` access, missing fields, empty UI states, parsing failures.

Check:
- Compare the actual payload or object shape with the code's assumption.
- Look for renamed keys, optional fields, or null values.

## Async ordering problem

Symptoms: flaky tests, stale UI, race-like behavior, values updating too late.

Check:
- Confirm which step finishes first.
- Inspect awaits, timers, retries, subscriptions, and state updates.

## Boundary conversion bug

Symptoms: off-by-one behavior, timezone mistakes, formatting mismatches, type coercion bugs.

Check:
- Compare raw input, transformed value, and stored value.
- Inspect parsing, rounding, string-number conversion, and date handling.

## Cache or stale state

Symptoms: old data remains visible, refresh fixes the issue, one view updates but another does not.

Check:
- Inspect invalidation, dependency arrays, memoized values, and local copies of server data.

## Error handling gap

Symptoms: silent failure, generic error message, success path assumed, crash on bad input.

Check:
- Trace what happens on non-200 responses, empty results, null values, and thrown exceptions.

## Contract drift

Symptoms: frontend and backend disagree, test fixtures pass but real calls fail, schema mismatch.

Check:
- Compare request and response contracts across both sides.
- Verify fixtures, mocks, and validation rules still match reality.
