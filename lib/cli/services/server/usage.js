'use strict';

function renderServerUsageText() {
  return `
\x1b[36mAI Home Server Helpers\x1b[0m

\x1b[33mUsage:\x1b[0m
  aih serve
  aih server
  aih server start
  aih server restart
  aih server stop
  aih server status
  aih server autostart <install|uninstall|status>
  aih server serve
  aih server serve [--port <n>]

\x1b[33mNotes:\x1b[0m
  - Default listen: http://127.0.0.1:8317
  - OpenAI-compatible endpoint: http://127.0.0.1:8317/v1
  - Default backend is codex-local (directly executes local codex accounts).
  - Default provider mode is auto (routes by model hint: gpt/o* -> codex, gemini* -> gemini).
  - Default strategy is random (weighted by account remaining usage).
  - No extra key setup is required in default mode.
  - aih serve is equivalent to aih server start (daemon mode).

\x1b[33mAdvanced (optional):\x1b[0m
  aih server serve [--host <ip>] [--port <n>] [--backend codex-local|openai-upstream] [--provider codex|gemini|auto] [--upstream <url>] [--strategy round-robin|random] [--session-affinity-ttl-ms <ms>] [--session-affinity-max <n>] [--client-key <key>] [--management-key <key>] [--cooldown-ms <ms>] [--max-attempts <n>] [--upstream-timeout-ms <ms>]
  aih server env [--base-url <url>] [--api-key <key>]
  aih server sync-codex [--management-url <url>] [--key <management-key>] [--parallel <1-32>] [--limit <n>] [--dry-run]
  management APIs: /v0/management/status, /v0/management/metrics, /v0/management/accounts, /v0/management/models, /v0/management/reload
`;
}

function showServerUsage(log = console.log) {
  log(renderServerUsageText());
}

module.exports = {
  renderServerUsageText,
  showServerUsage
};
