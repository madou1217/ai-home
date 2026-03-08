'use strict';

const path = require('node:path');
const { AI_CLI_CONFIGS, listSupportedAiClis } = require('../../services/ai-cli/provider-registry');

function runAiCliCommandRouter(cmd, args, context = {}) {
  const processImpl = context.processImpl || process;
  const fs = context.fs;
  const PROFILES_DIR = context.PROFILES_DIR;
  const HOST_HOME_DIR = context.HOST_HOME_DIR;
  const askYesNo = context.askYesNo;
  const showCliUsage = context.showCliUsage;
  const showLsHelp = context.showLsHelp;
  const listProfiles = context.listProfiles;
  const showCodexPolicy = context.showCodexPolicy;
  const setCodexPolicy = context.setCodexPolicy;
  const getProfileDir = context.getProfileDir;
  const clearExhausted = context.clearExhausted;
  const renderStageProgress = context.renderStageProgress;
  const printAllUsageSnapshots = context.printAllUsageSnapshots;
  const printUsageSnapshot = context.printUsageSnapshot;
  const printUsageSnapshotAsync = context.printUsageSnapshotAsync;
  const runUnifiedImport = context.runUnifiedImport;
  const parseCodexBulkImportArgs = context.parseCodexBulkImportArgs;
  const importCodexTokensFromOutput = context.importCodexTokensFromOutput;
  const extractActiveEnv = context.extractActiveEnv;
  const findEnvSandbox = context.findEnvSandbox;
  const getNextId = context.getNextId;
  const createAccount = context.createAccount;
  const runCliPty = context.runCliPty;
  const getNextAvailableId = context.getNextAvailableId;
  const checkStatus = context.checkStatus;
  const syncExhaustedStateFromUsage = context.syncExhaustedStateFromUsage;
  const isExhausted = context.isExhausted;
  const syncGlobalConfigToHost = context.syncGlobalConfigToHost;

  const cliName = cmd;
  if (!AI_CLI_CONFIGS[cliName]) {
    console.error(`\x1b[31m[aih] Unknown tool '${cliName}'. Supported: ${listSupportedAiClis().join(', ')}\x1b[0m`);
    processImpl.exit(1);
    return;
  }

  let idOrAction = args[1];
  const useImplicitAuto = cliName === 'codex' && !idOrAction;
  let forwardArgs = [];
  const UNLOCK_ACTIONS = new Set(['unlock', '--unlock', 'unexhaust', 'unban', 'release']);
  const USAGE_ACTIONS = new Set(['usage', '--usage', 'stats']);
  const POLICY_ACTIONS = new Set(['policy']);
  const KNOWN_ACTIONS = new Set(['ls', 'set-default', 'login', 'auto', ...POLICY_ACTIONS, ...UNLOCK_ACTIONS, ...USAGE_ACTIONS]);
  const NO_BROWSER_FLAG = '--no-browser';
  const hasNoBrowserFlag = (values) => Array.isArray(values) && values.some((item) => String(item || '').trim() === NO_BROWSER_FLAG);
  const stripNoBrowserFlag = (values) => (Array.isArray(values) ? values.filter((item) => String(item || '').trim() !== NO_BROWSER_FLAG) : []);
  const parseUsageJobsArgs = (tokens) => {
    const items = Array.isArray(tokens) ? tokens : [];
    let jobs = null;
    for (let i = 0; i < items.length; i += 1) {
      const t = String(items[i] || '').trim();
      if (!t) continue;
      if (t === '-j') {
        const next = String(items[i + 1] || '').trim();
        if (!/^\d+$/.test(next)) return { ok: false, error: 'Invalid jobs value. Usage: -j <number>' };
        jobs = Number(next);
        i += 1;
        continue;
      }
      if (/^-j\d+$/.test(t)) {
        jobs = Number(t.slice(2));
        continue;
      }
      return { ok: false, error: `Unknown usage scan arg: ${t}` };
    }
    if (jobs !== null && (!Number.isFinite(jobs) || jobs <= 0)) {
      return { ok: false, error: 'Jobs must be a positive integer.' };
    }
    return { ok: true, jobs };
  };
  const parseUsageQueryArgs = (tokens) => {
    const items = Array.isArray(tokens) ? tokens : [];
    let noCache = false;
    for (let i = 0; i < items.length; i += 1) {
      const t = String(items[i] || '').trim();
      if (!t) continue;
      if (t === '--no-cache') {
        noCache = true;
        continue;
      }
      return { ok: false, error: `Unknown usage query arg: ${t}` };
    }
    return { ok: true, noCache };
  };

  if (idOrAction === 'help') {
    showCliUsage(cliName);
    processImpl.exit(0);
    return;
  }

  if (idOrAction === 'ls') {
    const lsArg = String(args[2] || '').trim();
    if (lsArg === '--help' || lsArg === '-h' || lsArg === 'help') {
      showLsHelp(cliName);
      processImpl.exit(0);
      return;
    }
    if (lsArg && !/^\d+$/.test(lsArg)) {
      console.error(`\x1b[31m[aih] Invalid ID. Usage: aih ${cliName} ls [id]\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    listProfiles(cliName, lsArg || null);
    processImpl.exit(0);
    return;
  }

  if (idOrAction === '--help' || idOrAction === '-h') {
    showCliUsage(cliName);
    processImpl.exit(0);
    return;
  }

  if (idOrAction && POLICY_ACTIONS.has(idOrAction)) {
    if (cliName !== 'codex') {
      console.error(`\x1b[31m[aih] ${cliName} policy is unsupported. Only codex policy is available.\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const policyAction = String(args[2] || '').trim().toLowerCase();
    if (!policyAction || policyAction === 'show') {
      showCodexPolicy();
      processImpl.exit(0);
      return;
    }
    if (policyAction === 'set') {
      try {
        setCodexPolicy(args[3]);
        processImpl.exit(0);
      } catch (e) {
        console.error(`\x1b[31m[aih] ${e.message}\x1b[0m`);
        console.log('\x1b[90mUsage:\x1b[0m aih codex policy [set <workspace-write|read-only|danger-full-access>]');
        processImpl.exit(1);
      }
      return;
    }
    console.error(`\x1b[31m[aih] Unknown policy action '${policyAction}'.\x1b[0m`);
    console.log('\x1b[90mUsage:\x1b[0m aih codex policy [set <workspace-write|read-only|danger-full-access>]');
    processImpl.exit(1);
    return;
  }

  if (idOrAction && UNLOCK_ACTIONS.has(idOrAction)) {
    const targetId = args[2];
    if (!targetId || !/^\d+$/.test(targetId)) {
      console.error(`\x1b[31m[aih] Invalid ID. Usage: aih ${cliName} unlock <id>\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const sandboxDir = getProfileDir(cliName, targetId);
    if (!fs.existsSync(sandboxDir)) {
      console.error(`\x1b[31m[aih] Account ID ${targetId} does not exist.\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const cleared = clearExhausted(cliName, targetId);
    if (cleared) {
      console.log(`\x1b[32m[Success]\x1b[0m Cleared [Exhausted Limit] for ${cliName} Account ID ${targetId}.`);
    } else {
      console.log(`\x1b[90m[aih]\x1b[0m ${cliName} Account ID ${targetId} was not marked as exhausted.`);
    }
    processImpl.exit(0);
    return;
  }

  if (idOrAction && USAGE_ACTIONS.has(idOrAction)) {
    const targetId = args[2];
    const scanArgv = args.slice(2);
    if (!targetId || String(targetId).startsWith('-')) {
      const parsed = parseUsageJobsArgs(scanArgv);
      if (!parsed.ok) {
        console.error(`\x1b[31m[aih] ${parsed.error}\x1b[0m`);
        processImpl.exit(1);
        return;
      }
      Promise.resolve(printAllUsageSnapshots(cliName, { jobs: parsed.jobs }))
        .then(() => processImpl.exit(0))
        .catch((e) => {
          console.error(`\x1b[31m[aih] usage scan failed: ${e.message}\x1b[0m`);
          processImpl.exit(1);
        });
      return;
    }
    if (!/^\d+$/.test(targetId)) {
      console.error(`\x1b[31m[aih] Invalid ID. Usage: aih ${cliName} usage <id>\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const parsedQuery = parseUsageQueryArgs(args.slice(3));
    if (!parsedQuery.ok) {
      console.error(`\x1b[31m[aih] ${parsedQuery.error}\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const sandboxDir = getProfileDir(cliName, targetId);
    if (!fs.existsSync(sandboxDir)) {
      console.error(`\x1b[31m[aih] Account ID ${targetId} does not exist.\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const runPrintUsage = typeof printUsageSnapshotAsync === 'function'
      ? printUsageSnapshotAsync
      : printUsageSnapshot;
    Promise.resolve(runPrintUsage(cliName, targetId, { noCache: parsedQuery.noCache }))
      .then(() => processImpl.exit(0))
      .catch((e) => {
        console.error(`\x1b[31m[aih] usage query failed: ${e.message}\x1b[0m`);
        processImpl.exit(1);
      });
    return;
  }

  if (idOrAction === 'import' && typeof runUnifiedImport === 'function') {
    Promise.resolve(runUnifiedImport(args.slice(2), {
      provider: cliName,
      log: console.log,
      error: console.error,
      renderStageProgress
    }))
      .then((result) => {
        if (result.failedSources.length > 0) {
          processImpl.exit(1);
          return;
        }
        processImpl.exit(0);
      })
      .catch((e) => {
        console.error(`\x1b[31m[aih] ${cliName} import failed: ${e.message}\x1b[0m`);
        processImpl.exit(1);
      });
    return;
  }

  if (idOrAction === 'set-default') {
    const targetId = args[2];
    if (!targetId || !/^\d+$/.test(targetId)) {
      console.error(`\x1b[31m[aih] Invalid ID. Usage: aih ${cliName} set-default <id>\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const toolDir = path.join(PROFILES_DIR, cliName);
    const pDir = path.join(toolDir, targetId);
    if (!fs.existsSync(pDir)) {
      console.error(`\x1b[31m[aih] Account ID ${targetId} does not exist.\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    if (typeof syncGlobalConfigToHost === 'function') {
      const syncResult = syncGlobalConfigToHost(cliName, targetId);
      if (!syncResult || !syncResult.ok) {
        const reason = syncResult && syncResult.reason ? syncResult.reason : 'unknown_error';
        console.error(`\x1b[31m[aih] Failed to sync ${cliName} account ${targetId} to host global config (${reason}).\x1b[0m`);
        processImpl.exit(1);
        return;
      }
    }
    fs.writeFileSync(path.join(toolDir, '.aih_default'), targetId);
    console.log(`\x1b[32m[Success]\x1b[0m Set Account ID ${targetId} as default for ${cliName} in ai-home and synced host config.`);
    processImpl.exit(0);
    return;
  }

  const activeEnv = extractActiveEnv(cliName);
  if (activeEnv && !idOrAction) {
    let matchedId = findEnvSandbox(cliName, activeEnv);
    if (!matchedId) {
      matchedId = getNextId(cliName);
      createAccount(cliName, matchedId, true);
      fs.writeFileSync(path.join(getProfileDir(cliName, matchedId), '.aih_env.json'), JSON.stringify(activeEnv, null, 2));
      console.log(`\x1b[36m[aih]\x1b[0m Auto-detected API Keys! Created Sandbox \x1b[32m${matchedId}\x1b[0m bound to these keys.`);
    } else {
      console.log(`\x1b[36m[aih]\x1b[0m Auto-detected API Keys! Routing to existing Sandbox \x1b[32m${matchedId}\x1b[0m.`);
    }
    runCliPty(cliName, matchedId, args.slice(1), false);
    return;
  }

  if (idOrAction === 'login') {
    const mode = args[2];
    const loginForwardArgs = args.slice(2);
    const nextId = getNextId(cliName);
    if (mode === 'api_key') {
      console.log(`\n\x1b[36m[aih]\x1b[0m Configuring API Key mode for Sandbox \x1b[32m${nextId}\x1b[0m`);
      let newEnv = {};
      AI_CLI_CONFIGS[cliName].envKeys.forEach((k) => {
        const isOptional = k.includes('BASE_URL');
        const val = context.readLine.question(`${k}${isOptional ? ' (Optional)' : ''}: `).trim();
        if (val) newEnv[k] = val;
      });
      if (Object.keys(newEnv).length > 0) {
        createAccount(cliName, nextId, true);
        fs.writeFileSync(path.join(getProfileDir(cliName, nextId), '.aih_env.json'), JSON.stringify(newEnv, null, 2));
        console.log(`\x1b[32m[Success]\x1b[0m API Keys bound to Sandbox ${nextId}!\n`);
        runCliPty(cliName, nextId, [], false);
      } else {
        console.log('\x1b[31mNo keys provided. Operation cancelled.\x1b[0m');
      }
      return;
    }
    const shouldLogin = createAccount(cliName, nextId);
    if (shouldLogin) {
      runCliPty(cliName, nextId, loginForwardArgs, true);
    } else {
      console.log(`\x1b[36m[aih]\x1b[0m Account 1 is ready. Run \`aih ${cliName} 1\` to start.`);
      processImpl.exit(0);
    }
    return;
  }

  if (idOrAction === 'auto' || useImplicitAuto) {
    const toolDir = path.join(PROFILES_DIR, cliName);
    if (!fs.existsSync(toolDir)) {
      console.log(`\x1b[31mNo accounts found for ${cliName}. Use 'aih ${cliName} login' first.\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    const nextId = getNextAvailableId(cliName, null);
    if (!nextId) {
      console.log(`\x1b[31mNo active (non-exhausted) accounts found to auto-route. Use 'aih ${cliName} login' first.\x1b[0m`);
      processImpl.exit(1);
      return;
    }
    console.log(`\x1b[36m[aih auto]\x1b[0m Auto-selected Account ID: \x1b[32m${nextId}\x1b[0m`);
    forwardArgs = idOrAction === 'auto' ? args.slice(2) : [];
    runCliPty(cliName, nextId, forwardArgs);
    return;
  }

  let id = '1';
  if (idOrAction && /^\d+$/.test(idOrAction)) {
    id = idOrAction;
    const idStyleAction = args[2];
    if (idStyleAction && UNLOCK_ACTIONS.has(idStyleAction)) {
      const sandboxDir = getProfileDir(cliName, id);
      if (!fs.existsSync(sandboxDir)) {
        console.error(`\x1b[31m[aih] Account ID ${id} does not exist.\x1b[0m`);
        processImpl.exit(1);
        return;
      }
      const cleared = clearExhausted(cliName, id);
      if (cleared) {
        console.log(`\x1b[32m[Success]\x1b[0m Cleared [Exhausted Limit] for ${cliName} Account ID ${id}.`);
      } else {
        console.log(`\x1b[90m[aih]\x1b[0m ${cliName} Account ID ${id} was not marked as exhausted.`);
      }
      processImpl.exit(0);
      return;
    }
    if (idStyleAction && USAGE_ACTIONS.has(idStyleAction)) {
      const parsedQuery = parseUsageQueryArgs(args.slice(3));
      if (!parsedQuery.ok) {
        console.error(`\x1b[31m[aih] ${parsedQuery.error}\x1b[0m`);
        processImpl.exit(1);
        return;
      }
      const sandboxDir = getProfileDir(cliName, id);
      if (!fs.existsSync(sandboxDir)) {
        console.error(`\x1b[31m[aih] Account ID ${id} does not exist.\x1b[0m`);
        processImpl.exit(1);
        return;
      }
      const runPrintUsage = typeof printUsageSnapshotAsync === 'function'
        ? printUsageSnapshotAsync
        : printUsageSnapshot;
      Promise.resolve(runPrintUsage(cliName, id, { noCache: parsedQuery.noCache }))
        .then(() => processImpl.exit(0))
        .catch((e) => {
          console.error(`\x1b[31m[aih] usage query failed: ${e.message}\x1b[0m`);
          processImpl.exit(1);
        });
      return;
    }
    forwardArgs = args.slice(2);
  } else {
    if (idOrAction && !KNOWN_ACTIONS.has(idOrAction)) {
      console.error(`\x1b[31m[aih]\x1b[0m Unknown subcommand: ${idOrAction}`);
      showCliUsage(cliName);
      processImpl.exit(1);
      return;
    }
    try {
      const defPath = path.join(PROFILES_DIR, cliName, '.aih_default');
      if (fs.existsSync(defPath)) {
        id = fs.readFileSync(defPath, 'utf8').trim();
      }
    } catch (_e) {
      // ignore
    }
    if (idOrAction) {
      forwardArgs = args.slice(1);
    }
  }

  const sandboxDir = getProfileDir(cliName, id);
  const idNoBrowserOnly = /^\d+$/.test(String(idOrAction || ''))
    && hasNoBrowserFlag(forwardArgs)
    && stripNoBrowserFlag(forwardArgs).length === 0;
  if (!fs.existsSync(sandboxDir)) {
    if (idNoBrowserOnly) {
      const shouldLogin = createAccount(cliName, id);
      if (shouldLogin) {
        runCliPty(cliName, id, [NO_BROWSER_FLAG], true);
      } else {
        processImpl.exit(0);
      }
      return;
    }
    const globalFolder = AI_CLI_CONFIGS[cliName] ? AI_CLI_CONFIGS[cliName].globalDir : `.${cliName}`;
    const globalPath = path.join(HOST_HOME_DIR, globalFolder);
    if (id === '1' && fs.existsSync(globalPath) && fs.readdirSync(globalPath).length > 0) {
      const shouldLogin = createAccount(cliName, id);
      if (shouldLogin) {
        runCliPty(cliName, id, [], true);
        return;
      }
    } else {
      console.log(`\x1b[90mAccount ID ${id} for ${cliName} does not exist yet.\x1b[0m`);
      const ans = askYesNo(`\x1b[33mCreate Account ${id} and log in now?\x1b[0m`);
      if (ans === false) {
        console.log('Operation cancelled.');
        processImpl.exit(0);
        return;
      }
      const shouldLogin = createAccount(cliName, id);
      if (shouldLogin) {
        runCliPty(cliName, id, [], true);
        return;
      }
    }
  }

  const { configured } = checkStatus(cliName, sandboxDir);
  if (idNoBrowserOnly) {
    if (!configured) {
      runCliPty(cliName, id, [NO_BROWSER_FLAG], true);
      return;
    }
    const nextId = getNextId(cliName);
    console.log(`\x1b[33m[Notice]\x1b[0m Account ${id} is already logged in. Creating Account ${nextId} for no-browser OAuth login.`);
    const shouldLogin = createAccount(cliName, nextId);
    if (shouldLogin) {
      runCliPty(cliName, nextId, [NO_BROWSER_FLAG], true);
    } else {
      processImpl.exit(0);
    }
    return;
  }
  if (!configured) {
    console.log(`\n\x1b[33m[Notice]\x1b[0m Account ${id} exists but seems to have no login state.`);
    const ans = askYesNo(`Do you want to run the login flow for Account ${id} now?`);
    if (ans !== false) {
      runCliPty(cliName, id, [], true);
      return;
    }
  }

  syncExhaustedStateFromUsage(cliName, id);
  if (isExhausted(cliName, id)) {
    console.log(`\x1b[33m[Warning]\x1b[0m Account ${id} is currently marked as exhausted.`);
    const ans = askYesNo(`Still want to proceed? (Select N to use 'auto' routing instead)`, false);
    if (ans === false) {
      console.log("Use `aih <cli> auto` to automatically pick a valid account.");
      processImpl.exit(0);
      return;
    }
  }

  runCliPty(cliName, id, forwardArgs);
}

module.exports = {
  runAiCliCommandRouter
};
