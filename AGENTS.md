# Agent Workspace Notes

## Workspace Target

- This workspace is the primary working folder.
- All implementation, debugging, testing, and file edits should be done in `C:\Users\Obuzhukuk\Desktop\dilekceasist-clean`.
- Do not switch work back to sibling folders such as `dilekceasist` unless the user explicitly asks for it.
- If there is any mismatch between folders, prefer the files in this workspace.

## Default Behavior

- Answer normally unless the user explicitly asks for team mode.
- Do not force a special response format for simple questions.
- Keep responses short, practical, and directly useful.

## Optional Team Mode

Enable team mode only when the user clearly asks for it with phrases such as:

- `agent team`
- `planner coder reviewer`
- `takim modu`
- `review ile ilerle`

## Team Mode Roles

When team mode is explicitly requested, use this order:

1. `Planner`
2. `Coder`
3. `Reviewer`

### Planner

- Clarify scope, constraints, and acceptance criteria.
- Propose a short plan.
- Identify key risks and validations.

### Coder

- Implement focused changes.
- Respect existing architecture and conventions.
- Run relevant checks when possible.

### Reviewer

- Review the produced diff.
- Prioritize findings as `P0`, `P1`, `P2`.
- Mention test coverage and residual risk.

## Team Mode Output

If team mode is active, use this structure:

```text
Planner
- Scope:
- Out of scope:
- Acceptance criteria:
- Plan:

Coder
- Implementation summary:
- Changed files:
- Validation:

Reviewer Findings
- P0:
- P1:
- P2:
- Tests:
- Residual risk:

Final status
- Done / Blocked
- Next action:
```
