'use strict';

const { normalizeRootCommandArgs } = require('./args');
const { runRootAccountCommand } = require('./account');

function isHelpCommand(cmd) {
  return !cmd || cmd === 'help' || cmd === '--help' || cmd === '-h';
}

async function runCliRootRouter(rawArgs, deps = {}) {
  const processObj = deps.processObj || process;
  const consoleImpl = deps.consoleImpl || console;
  const { args, cmd } = normalizeRootCommandArgs(rawArgs);

  if (isHelpCommand(cmd)) {
    deps.showHelp();
    processObj.exit(0);
    return;
  }

  const handleLsCommand = async () => {
    const lsArg = String(args[1] || '').trim();
    if (lsArg === '--help' || lsArg === '-h' || lsArg === 'help') {
      deps.showLsHelp();
      processObj.exit(0);
      return;
    }
    deps.listProfiles();
    processObj.exit(0);
  };

  const preBackupHandlers = {
    proxy: async () => {
      consoleImpl.error('\x1b[31m[aih] `proxy` command has been replaced. Use `aih server ...` or `aih serve`.\x1b[0m');
      processObj.exit(1);
    },
    '__usage-probe': async () => {
      const cliName = String(args[1] || '').trim();
      const id = String(args[2] || '').trim();
      if (!cliName || !/^\d+$/.test(id)) {
        processObj.stderr.write('invalid_usage_probe_args');
        processObj.exit(1);
        return;
      }
      const payload = deps.buildUsageProbePayload(cliName, id);
      processObj.stdout.write(JSON.stringify(payload));
      processObj.exit(0);
    },
    ls: handleLsCommand,
    list: handleLsCommand,
    account: async () => {
      await runRootAccountCommand(args, deps);
    },
    dev: async () => {
      const exitCode = await deps.runDevCommand(args.slice(1), deps.devContext);
      processObj.exit(Number(exitCode) || 0);
    }
  };

  const preBackupHandler = preBackupHandlers[cmd];
  if (preBackupHandler) {
    await preBackupHandler();
    return;
  }

  if (await deps.runBackupCommand(cmd, args, deps.backupContext)) {
    return;
  }

  const postBackupHandlers = {
    server: async () => {
      try {
        const code = await deps.runServerEntry(args, deps.serverEntryContext);
        if (typeof code === 'number') {
          processObj.exit(code);
        }
      } catch (e) {
        consoleImpl.error(`\x1b[31m[aih] server failed: ${e.message}\x1b[0m`);
        processObj.exit(1);
      }
    }
  };

  const postBackupHandler = postBackupHandlers[cmd];
  if (postBackupHandler) {
    await postBackupHandler();
    return;
  }

  deps.runAiCliCommandRouter(cmd, args, deps.aiCliContext);
}

module.exports = {
  runCliRootRouter
};
