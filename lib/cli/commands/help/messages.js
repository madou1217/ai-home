'use strict';

function createCliHelpService(options = {}) {
  const {
    log = console.log
  } = options;

  function showHelp() {
    log(`
\x1b[36mAI Home (aih)\x1b[0m - Multi-account sandbox manager for AI CLIs

\x1b[33mUsage:\x1b[0m
  aih ls                    \x1b[90mList all tools, accounts, and their status\x1b[0m
  aih ls --help             \x1b[90mShow list mode help (paging behavior)\x1b[0m
  aih <cli> ls              \x1b[90mList accounts for a specific tool\x1b[0m
  aih <cli> ls --help       \x1b[90mShow list mode help for this tool\x1b[0m
  aih <cli> add [or login]  \x1b[90mCreate a new account and run the login flow\x1b[0m
  aih <cli>                 \x1b[90mRun a tool with the default account (ID: 1)\x1b[0m
  aih <cli> auto            \x1b[90mRun the next non-exhausted account automatically\x1b[0m
  aih <cli> usage <id>      \x1b[90mShow trusted usage-remaining snapshot (OAuth only)\x1b[0m
  aih <cli> usages          \x1b[90mShow trusted usage-remaining snapshots for all OAuth accounts\x1b[0m
  aih dev mock-usage <provider> <id> [--remaining <pct>] [--duration-sec <sec>] \x1b[90mTemporarily mock usage snapshot for threshold switch testing\x1b[0m
  aih account import [dir] [--dry-run]\x1b[90mAuto import from accounts/<provider> roots\x1b[0m
  aih <cli> account import [dir] [--dry-run]\x1b[90mImport account tokens/state for this provider\x1b[0m
  aih <cli> <id> usage      \x1b[90mSame as above, ID-first style\x1b[0m
  aih <cli> unlock <id>     \x1b[90mManually clear [Exhausted Limit] for an account\x1b[0m
  aih <cli> <id> unlock     \x1b[90mSame as above, ID-first style\x1b[0m
  aih <cli> <id> [args]     \x1b[90mRun a tool with a specific account ID\x1b[0m
  aih serve                 \x1b[90mStart local OpenAI-compatible server (daemon mode)\x1b[0m
  aih server [action]       \x1b[90mManage local OpenAI-compatible server\x1b[0m
  
\x1b[33mAdvanced:\x1b[0m
  aih <cli> set-default <id>\x1b[90mSet default account for aih only\x1b[0m
  aih export [file.aes] [selectors...] \x1b[90mSecurely export profiles. Selectors e.g. codex:1,2 gemini\x1b[0m
  aih import [-o] <file.aes>\x1b[90mRestore profiles; default skips same account, -o overwrites\x1b[0m
`);
  }

  function showCliUsage(cliName) {
    log(`
\x1b[36mAI Home (aih)\x1b[0m - Subcommands for \x1b[33m${cliName}\x1b[0m

\x1b[33mUsage:\x1b[0m
  aih ${cliName} ls              \x1b[90mList all ${cliName} accounts\x1b[0m
  aih ${cliName} ls --help       \x1b[90mShow list mode help (paging behavior)\x1b[0m
  aih ${cliName} add             \x1b[90mCreate a new account and login\x1b[0m
  aih ${cliName} login           \x1b[90mAlias of add\x1b[0m
  aih ${cliName} auto            \x1b[90mAuto-select next non-exhausted account\x1b[0m
  aih ${cliName} usage <id>      \x1b[90mShow trusted usage-remaining snapshot (OAuth)\x1b[0m
  aih ${cliName} usages          \x1b[90mShow trusted usage snapshots for all OAuth accounts\x1b[0m
  ${cliName === 'codex' ? 'aih codex policy [set <workspace-write|read-only|danger-full-access>]  \x1b[90mShow or update exec sandbox policy\x1b[0m' : ''}
  aih ${cliName} account import [dir] [--dry-run]  \x1b[90mImport account tokens/state for this provider\x1b[0m
  aih ${cliName} unlock <id>     \x1b[90mClear exhausted flag manually\x1b[0m
  aih ${cliName} <id> usage      \x1b[90mID-first style usage query\x1b[0m
  aih ${cliName} <id> unlock     \x1b[90mID-first style manual unlock\x1b[0m
  aih ${cliName} <id> [args]     \x1b[90mRun ${cliName} under a specific account\x1b[0m
  aih ${cliName}                 \x1b[90mRun with default account\x1b[0m
`);
  }

  return {
    showHelp,
    showCliUsage
  };
}

module.exports = {
  createCliHelpService
};
