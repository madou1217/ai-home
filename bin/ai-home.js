#!/usr/bin/env node

const SQLITE_EXPERIMENTAL_WARNING_RE = /SQLite is an experimental feature/i;

process.on('warning', (warning) => {
  const name = String((warning && warning.name) || '');
  const message = String((warning && warning.message) || '');
  if (name === 'ExperimentalWarning' && SQLITE_EXPERIMENTAL_WARNING_RE.test(message)) {
    return;
  }
  const stack = warning && warning.stack ? String(warning.stack) : `${name}: ${message}`;
  process.stderr.write(`${stack}\n`);
});

require('../lib/cli/app');
