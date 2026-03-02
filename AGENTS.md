# Repository Guidelines

## Project Structure & Module Organization
This repository is a small Node.js CLI project.

- `bin/ai-home.js`: main executable (`aih`) with CLI parsing, sandbox/profile management, and PTY runtime logic.
- `README.md` / `README_en.md`: user-facing docs (Chinese and English).
- `ROADMAP.md`: milestone and product planning notes.
- `package.json`: runtime dependencies and npm scripts.
- `node_modules/`: installed dependencies (generated, do not edit manually).

When adding features, keep CLI behavior in `bin/ai-home.js` cohesive by grouping related helpers (profile state, auth/env routing, process control).

### Collaboration Rule: Keep `bin/ai-home.js` Thin
- Treat `bin/ai-home.js` as an entry/router layer. Put new business logic in `lib/*` modules by default.
- For non-trivial changes, prefer:
  1) parse/dispatch in `bin/ai-home.js`
  2) implementation in `lib/<domain>/...`
- If a change touches existing large inline helpers in `bin/ai-home.js`, prefer extracting them into `lib/*` in the same PR.
- Avoid adding new long utility blocks directly into `bin/ai-home.js` unless it is a tiny glue-only change.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm test`: currently a placeholder and exits with error (`"no test specified"`).
- `node bin/ai-home.js --help`: run the CLI directly for local verification.
- `npm link` then `aih ls`: expose the `aih` command globally for manual end-to-end checks.

Example workflow:
```bash
npm install
node bin/ai-home.js ls
```

## Coding Style & Naming Conventions
- Use CommonJS (`require`, `module.exports`) and Node-compatible JavaScript.
- Prefer 2-space indentation and semicolons, matching `bin/ai-home.js`.
- Use `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants (for example `PROFILES_DIR`).
- Keep CLI output concise and consistent with existing ANSI color usage.

No formatter/linter is currently configured; keep style consistent with surrounding code when editing.

## Testing Guidelines
Automated tests are not set up yet. For now, validate changes with focused manual CLI checks:

- Account listing: `node bin/ai-home.js ls`
- Tool-specific flows: `node bin/ai-home.js codex ls`
- Help/usage output: `node bin/ai-home.js --help`

If adding tests, place them in a new `test/` directory and use `*.test.js` naming.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit style:
- `feat: ...`
- `fix: ...`
- `docs: ...`

Follow the same pattern with clear, scoped messages.

For pull requests, include:
- A short problem/solution summary.
- CLI commands used to validate behavior.
- Before/after terminal output snippets for user-visible CLI changes.
- Linked issue or roadmap item when applicable.

## Security & Configuration Tips
- Never commit API keys, tokens, or exported profile archives.
- Treat `~/.ai_home` profile data as sensitive; use sanitized examples in docs and PRs.
