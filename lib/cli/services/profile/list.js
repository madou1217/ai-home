'use strict';

function createProfileListService(options = {}) {
  const {
    fs,
    path,
    processObj,
    readline,
    profilesDir,
    cliConfigs,
    listPageSize,
    getToolAccountIds,
    getAccountStateIndex,
    checkStatus,
    isExhausted,
    formatUsageLabel,
    refreshIndexedStateForAccount
  } = options;

  function showLsHelp(scope = null) {
    const target = scope ? `aih ${scope} ls` : 'aih ls';
    console.log(`
\x1b[36mAI Home List Mode Help\x1b[0m

\x1b[33mUsage:\x1b[0m
  ${target}

\x1b[33mBehavior:\x1b[0m
  - Default output: first ${listPageSize} accounts.
  - Interactive mode: if output is a terminal (TTY), shows pager prompt after each page.
  - Keys in pager: \x1b[32mSpace\x1b[0m = next page, \x1b[32mq\x1b[0m = quit.
  - Non-interactive mode (pipe/redirect): show first ${listPageSize} and print omitted count.

\x1b[33mExamples:\x1b[0m
  aih ls
  aih codex ls
  aih codex ls --help
`);
  }

  function listProfiles(filterCliName = null) {
    console.log('\n\x1b[36m📦 AI Home Accounts Overview\x1b[0m\n');

    if (!fs.existsSync(profilesDir)) {
      console.log('  No profiles found.');
      return;
    }

    let tools = fs.readdirSync(profilesDir)
      .filter((f) => fs.statSync(path.join(profilesDir, f)).isDirectory())
      .filter((f) => !!cliConfigs[f]);

    if (filterCliName) {
      tools = tools.filter((t) => t === filterCliName);
    }

    if (tools.length === 0) {
      console.log('  No profiles found.');
      return;
    }

    tools.forEach((tool) => {
      console.log(`\x1b[33m▶ ${tool}\x1b[0m`);
      const toolDir = path.join(profilesDir, tool);
      const ids = getToolAccountIds(tool);
      const indexedStates = getAccountStateIndex().listStates(tool);
      const indexedMap = new Map(indexedStates.map((row) => [row.accountId, row]));
      const useFastIndexView = ids.length >= 500;

      if (ids.length === 0) {
        console.log('  (Empty)');
      } else {
        const seenAccounts = new Map();
        let defaultId = null;
        try {
          const defPath = path.join(toolDir, '.aih_default');
          if (fs.existsSync(defPath)) defaultId = fs.readFileSync(defPath, 'utf8').trim();
        } catch (_error) {}

        const interactivePager = !!(processObj.stdout && processObj.stdout.isTTY);
        let cursor = 0;
        while (cursor < ids.length) {
          const batch = ids.slice(cursor, cursor + listPageSize);
          batch.forEach((id) => {
            if (!/^\d+$/.test(String(id || ''))) return;
            const pDir = path.join(toolDir, id);
            let configured = false;
            let accountName = 'Unknown';
            let exhaustedFlag = false;
            let usageLabel = '';

            if (useFastIndexView && indexedMap.has(id)) {
              const row = indexedMap.get(id);
              configured = !!row.configured;
              accountName = row.apiKeyMode
                ? 'API Key'
                : (row.displayName ? String(row.displayName) : 'Unknown');
              exhaustedFlag = !!row.exhausted;
              if (row.apiKeyMode) {
                usageLabel = '\x1b[90m[Usage: API Key mode]\x1b[0m';
              } else if (typeof row.remainingPct === 'number') {
                usageLabel = `\x1b[36m[Usage: ${row.remainingPct.toFixed(1)}%]\x1b[0m`;
              }
            } else {
              const status = checkStatus(tool, pDir);
              configured = !!status.configured;
              accountName = status.accountName;
              exhaustedFlag = isExhausted(tool, id);
              usageLabel = formatUsageLabel(tool, id, accountName);
              refreshIndexedStateForAccount(tool, id, { refreshSnapshot: false });
            }

            const exhausted = exhaustedFlag ? '\x1b[31m[Exhausted Limit]\x1b[0m ' : '';
            const isDefault = (id === defaultId) ? '\x1b[32m[★ Default]\x1b[0m ' : '';
            const statusStr = configured
              ? '\x1b[32mActive\x1b[0m'
              : '\x1b[90mPending Login\x1b[0m';
            const accountInfo = configured && accountName !== 'Unknown' ? `(${accountName})` : '';

            let duplicateWarning = '';
            if (configured && accountName !== 'Unknown' && accountName !== 'Token Configured' && !accountName.startsWith('API Key')) {
              if (seenAccounts.has(accountName)) {
                duplicateWarning = ` \x1b[31m[⚠️ Duplicate of ID ${seenAccounts.get(accountName)}]\x1b[0m`;
              } else {
                seenAccounts.set(accountName, id);
              }
            }

            console.log(`  - Account ID: \x1b[36m${id}\x1b[0m  ${isDefault}[${statusStr}] ${exhausted}\x1b[35m${accountInfo}\x1b[0m ${usageLabel} ${duplicateWarning}`);
          });
          cursor += batch.length;
          if (cursor >= ids.length) break;
          const remaining = ids.length - cursor;
          if (!interactivePager) {
            console.log(`  \x1b[90m... omitted ${remaining} accounts\x1b[0m`);
            break;
          }
          processObj.stdout.write(`  \x1b[90m-- More (${remaining} remaining) [Space=next, q=quit]\x1b[0m`);
          let key = '';
          try {
            key = String(readline.keyIn('', { hideEchoBack: true, mask: '', limit: ' q' }) || '');
          } catch (_error) {
            processObj.stdout.write('\n');
            break;
          }
          processObj.stdout.write('\r\x1b[K');
          if (key.toLowerCase() === 'q') {
            console.log(`  \x1b[90m... omitted ${remaining} accounts\x1b[0m`);
            break;
          }
        }
      }
      console.log('');
    });
  }

  return {
    showLsHelp,
    listProfiles
  };
}

module.exports = {
  createProfileListService
};
