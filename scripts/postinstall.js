#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function ensureExecutable(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    fs.chmodSync(filePath, 0o755);
  } catch (err) {
    // Best effort only: do not fail installation for permission tweaks.
  }
}

function main() {
  if (process.platform !== 'darwin') return;

  const rootDir = path.resolve(__dirname, '..');
  const helpers = [
    path.join(rootDir, 'node_modules', 'node-pty', 'prebuilds', 'darwin-x64', 'spawn-helper'),
    path.join(rootDir, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper')
  ];

  helpers.forEach(ensureExecutable);
}

main();
