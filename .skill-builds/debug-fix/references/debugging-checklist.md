# Debugging Checklist

Use this checklist when the issue is real but the cause is not yet clear.

## 1. Capture the failure

- Save the exact command, page flow, input, or test that fails.
- Save the exact error text, file name, line number, status code, or visible symptom.
- Note whether the issue is deterministic or flaky.

## 2. Reproduce on the smallest surface

- Prefer a single test, one API call, one page flow, or one script over a full suite.
- Remove unrelated steps until the failure still happens with minimal setup.
- If reproduction depends on data or environment, write that down before changing code.

## 3. Shrink the search space

- Check the closest failing boundary first: input, parser, state update, async step, database write, API response, or rendered output.
- Compare expected vs actual values at each boundary.
- Use targeted logs or assertions to confirm where the behavior first diverges.

## 4. Confirm root cause

- Build a short hypothesis from evidence.
- Make one focused change or observation that can prove or disprove that hypothesis.
- Reject hypotheses quickly when evidence does not support them.

## 5. Apply the safest fix

- Fix the confirmed cause, not only the visible symptom.
- Prefer the smallest change that restores correct behavior.
- Avoid cleanup refactors in the same patch unless they are required for safety or readability.

## 6. Validate

- Re-run the exact reproduction path.
- Run nearby tests or checks that cover likely regressions.
- Verify that error handling still behaves sensibly for bad inputs or edge cases.

## 7. Communicate

- State what was broken.
- State why it broke.
- State what changed and how you verified it.
- State any remaining uncertainty if validation was partial.
