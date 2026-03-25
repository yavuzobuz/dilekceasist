---
name: debug-fix
description: Systematic debugging and bug-fixing workflow for runtime errors, failing tests, stack traces, broken UI flows, logs, flaky behavior, regressions, and unexpected outputs. Use when Codex needs to reproduce a bug, isolate the failing boundary, identify root cause, apply the smallest safe fix, and verify the result in English or Turkish, including requests like "hata ayikla", "hatayi bul", "neden bozuldu", "fix et", "test failini coz", or "bunu duzelt".
---

# Debug Fix

## Overview

Debug systematically. Reproduce the failure first, collect evidence, prefer the smallest safe fix, and prove the reported problem is gone before closing the task.

Load [references/debugging-checklist.md](references/debugging-checklist.md) for the step-by-step checklist. Load [references/common-bug-patterns.md](references/common-bug-patterns.md) when the failure mode is unclear or the search space is too broad. Load [references/triggers-and-usage-tr.md](references/triggers-and-usage-tr.md) for Turkish trigger examples and beginner-friendly phrasing.

## Debug Workflow

1. Restate the symptom in one sentence, including where it appears and what should happen instead.
2. Reproduce the issue with the smallest reliable command, page flow, or test case.
3. Narrow the search space by checking the nearest failing boundary: input, state change, network call, persistence layer, rendered output, or side effect.
4. Form one to three root-cause hypotheses grounded in evidence, not guesses.
5. Add temporary logging, targeted assertions, or a focused test only when reproduction alone does not isolate the cause.
6. Change the smallest amount of code that fixes the confirmed cause. Avoid mixing refactors into the fix unless they are required for safety.
7. Re-run the reproduction path and nearby checks to confirm the bug is fixed and nothing obvious regressed.
8. Explain the root cause, the fix, and the validation in plain language when the user seems less experienced.

## Operating Rules

- Prefer evidence over intuition. Quote the exact error, failing condition, or observed mismatch in your notes.
- Avoid large rewrites before reproducing the problem.
- Keep temporary debugging code out of the final patch unless it adds lasting value.
- If the bug cannot be reproduced, say that clearly and shift to better instrumentation, better test coverage, or environment comparison.
- If multiple fixes are possible, choose the one with the smallest blast radius first.
- When a fix touches contracts, persistence, auth, or deployment behavior, expand validation beyond the original symptom.

## Output Contract

- State the observed symptom and confirmed root cause separately.
- Summarize the minimal fix, not every explored path.
- Name the checks you ran and what they proved.
- Call out residual risk when validation is partial or the bug was flaky.
