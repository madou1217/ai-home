'use strict';

const AI_CLI_CONFIGS = Object.freeze({
  gemini: Object.freeze({
    globalDir: '.gemini',
    loginArgs: Object.freeze(['auth']),
    pkg: '@google/gemini-cli',
    envKeys: Object.freeze(['GEMINI_API_KEY', 'GOOGLE_API_KEY'])
  }),
  claude: Object.freeze({
    globalDir: '.claude',
    loginArgs: Object.freeze(['login']),
    pkg: '@anthropic-ai/claude-code',
    envKeys: Object.freeze(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'])
  }),
  codex: Object.freeze({
    globalDir: '.codex',
    loginArgs: Object.freeze(['login']),
    pkg: '@openai/codex',
    envKeys: Object.freeze(['OPENAI_API_KEY', 'OPENAI_BASE_URL'])
  })
});

const AI_CLI_ACCOUNT_IMPORT_SUPPORT = Object.freeze({
  codex: true,
  gemini: false,
  claude: false
});

function getAiCliConfig(cliName) {
  return AI_CLI_CONFIGS[String(cliName || '').trim()] || null;
}

function isSupportedAiCli(cliName) {
  return !!getAiCliConfig(cliName);
}

function listSupportedAiClis() {
  return Object.keys(AI_CLI_CONFIGS);
}

function canImportAccounts(cliName) {
  return !!AI_CLI_ACCOUNT_IMPORT_SUPPORT[String(cliName || '').trim()];
}

function listAccountImportSupportedAiClis() {
  return listSupportedAiClis().filter((name) => canImportAccounts(name));
}

module.exports = {
  AI_CLI_CONFIGS,
  AI_CLI_ACCOUNT_IMPORT_SUPPORT,
  getAiCliConfig,
  isSupportedAiCli,
  listSupportedAiClis,
  canImportAccounts,
  listAccountImportSupportedAiClis
};
