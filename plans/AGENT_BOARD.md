# Subagent Board

This board is derived from `plans/*.plan.md`.

## View current active work

```bash
npm run plan:board
```

Shows only active tasks (`doing` and `blocked`) so you can quickly see which AI/subagent is currently working.

## View full task board

```bash
npm run plan:board -- --all
```

Includes `todo` and `done`.

## Source of truth

- Each worker must update task fields in the target `plans/*.plan.md` file.
- Each worker must sync markdown checklist line (`- [ ]` / `- [x]`) for the same task ID.
- No private board is allowed.
- `owner` + `status` are required for live visibility.
