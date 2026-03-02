# Codex Agent Team Mode

## Goal

Run tasks with a strict role-based workflow inside a single Codex session.
Use this when requests involve non-trivial changes, risk, or multiple decisions.

## Team Roles

### 1) Planner

- Clarify target outcome, constraints, and acceptance criteria.
- Propose a short execution plan (3-7 steps).
- Identify key risks and validations.

### 2) Coder

- Implement the approved plan with minimal, focused diffs.
- Keep compatibility with existing architecture and conventions.
- Execute relevant checks (build/tests/lint or targeted commands).

### 3) Reviewer

- Perform code review on the produced diff.
- Prioritize findings by severity: `P0`, `P1`, `P2`.
- Confirm test coverage and call out residual risk.

## Operating Protocol

1. Start every substantial task in `Planner` mode.
2. Move to `Coder` only after scope and acceptance criteria are explicit.
3. Finish with `Reviewer` findings before final handoff.
4. If findings are `P0/P1`, return to `Coder` and iterate.
5. In final response, always include:
   - What changed
   - Validation run
   - Open risks or assumptions

## Activation Phrases

User can trigger this mode with phrases like:

- "agent team"
- "planner coder reviewer"
- "takim modu"
- "review ile ilerle"

## Response Contract

When team mode is active, format work in this order:

1. `Planner`: scope, plan, acceptance criteria
2. `Coder`: implementation summary + changed files
3. `Reviewer`: findings and risk assessment
4. Final status: done / blocked, with next action

## Lightweight Templates

### Planning Template

```text
Planner
- Scope:
- Out of scope:
- Acceptance criteria:
- Plan:
```

### Review Template

```text
Reviewer Findings
- P0:
- P1:
- P2:
- Tests:
- Residual risk:
```
