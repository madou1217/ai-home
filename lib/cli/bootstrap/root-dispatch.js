'use strict';

function createRootCommandContexts(deps = {}) {
  const devContext = {
    fs: deps.fs,
    path: deps.path,
    ensureDir: deps.ensureDir,
    getUsageCachePath: deps.getUsageCachePath,
    readUsageCache: deps.readUsageCache,
    usageConstants: {
      schemaVersion: deps.usageSnapshotSchemaVersion,
      codexSource: deps.usageSourceCodex,
      geminiSource: deps.usageSourceGemini,
      claudeSource: deps.usageSourceClaudeOauth
    },
    log: deps.log,
    error: deps.error
  };

  const backupContext = {
    fs: deps.fs,
    path: deps.path,
    os: deps.os,
    fse: deps.fse,
    execSync: deps.execSync,
    readline: deps.readline,
    consoleImpl: deps.consoleImpl,
    processImpl: deps.processObj,
    aiHomeDir: deps.aiHomeDir,
    hostHomeDir: deps.hostHomeDir,
    hasAgeBinary: deps.hasAgeBinary,
    tryAutoInstallAge: deps.tryAutoInstallAge,
    getAgeCompatibleSshPublicKeys: deps.getAgeCompatibleSshPublicKeys,
    getAgeCompatibleSshPrivateKeys: deps.getAgeCompatibleSshPrivateKeys,
    getSshKeys: deps.getSshKeys,
    isAgeArmoredData: deps.isAgeArmoredData,
    runAgeEncrypt: deps.runAgeEncrypt,
    runAgeDecrypt: deps.runAgeDecrypt,
    loadRsaPrivateKey: deps.loadRsaPrivateKey,
    decryptSshRsaEnvelope: deps.decryptSshRsaEnvelope,
    buildPasswordEnvelope: deps.buildPasswordEnvelope,
    decryptPasswordEnvelope: deps.decryptPasswordEnvelope,
    parseEnvelope: deps.parseEnvelope,
    decryptLegacyEnvelope: deps.decryptLegacyEnvelope,
    serializeEnvelope: deps.serializeEnvelope,
    ensureAesSuffix: deps.ensureAesSuffix,
    defaultExportName: deps.defaultExportName,
    parseExportArgs: deps.parseExportArgs,
    parseImportArgs: deps.parseImportArgs,
    expandSelectorsToPaths: deps.expandSelectorsToPaths,
    renderStageProgress: deps.renderStageProgress,
    restoreProfilesFromExtractedBackup: deps.restoreProfilesFromExtractedBackup,
    getLikelyRsaSshPrivateKeys: deps.getLikelyRsaSshPrivateKeys,
    printRestoreDetails: deps.printRestoreDetails
  };

  const serverEntryContext = {
    fs: deps.fs,
    fetchImpl: deps.fetchImpl,
    http: deps.http,
    processObj: deps.processObj,
    aiHomeDir: deps.aiHomeDir,
    logFile: deps.serverLogFile,
    getToolAccountIds: deps.getToolAccountIds,
    getToolConfigDir: deps.getToolConfigDir,
    getProfileDir: deps.getProfileDir,
    checkStatus: deps.checkStatus,
    syncCodexAccountsToServer: deps.syncCodexAccountsToServer,
    startLocalServerModule: deps.startLocalServerModule,
    runServerCommand: deps.runServerCommand,
    showServerUsage: deps.showServerUsage,
    serverDaemon: deps.serverDaemon,
    parseServerSyncArgs: deps.parseServerSyncArgs,
    parseServerServeArgs: deps.parseServerServeArgs,
    parseServerEnvArgs: deps.parseServerEnvArgs
  };

  const aiCliContext = {
    processImpl: deps.processObj,
    fs: deps.fs,
    readLine: deps.readline,
    PROFILES_DIR: deps.profilesDir,
    HOST_HOME_DIR: deps.hostHomeDir,
    askYesNo: deps.askYesNo,
    showCliUsage: deps.showCliUsage,
    showLsHelp: deps.showLsHelp,
    listProfiles: deps.listProfiles,
    showCodexPolicy: deps.showCodexPolicy,
    setCodexPolicy: deps.setCodexPolicy,
    getProfileDir: deps.getProfileDir,
    clearExhausted: deps.clearExhausted,
    printAllUsageSnapshots: deps.printAllUsageSnapshots,
    printUsageSnapshot: deps.printUsageSnapshot,
    parseCodexBulkImportArgs: deps.parseCodexBulkImportArgs,
    importCodexTokensFromOutput: deps.importCodexTokensFromOutput,
    extractActiveEnv: deps.extractActiveEnv,
    findEnvSandbox: deps.findEnvSandbox,
    getNextId: deps.getNextId,
    createAccount: deps.createAccount,
    runCliPty: deps.runCliPty,
    getNextAvailableId: deps.getNextAvailableId,
    checkStatus: deps.checkStatus,
    syncExhaustedStateFromUsage: deps.syncExhaustedStateFromUsage,
    isExhausted: deps.isExhausted,
    syncGlobalConfigToHost: deps.syncGlobalConfigToHost
  };

  return {
    devContext,
    backupContext,
    serverEntryContext,
    aiCliContext
  };
}

function createRootRouterDeps(deps = {}) {
  return {
    processObj: deps.processObj,
    consoleImpl: deps.consoleImpl,
    fs: deps.fs,
    buildUsageProbePayload: deps.buildUsageProbePayload,
    showHelp: deps.showHelp,
    showLsHelp: deps.showLsHelp,
    listProfiles: deps.listProfiles,
    runGlobalAccountImport: deps.runGlobalAccountImport,
    parseCodexBulkImportArgs: deps.parseCodexBulkImportArgs,
    importCodexTokensFromOutput: deps.importCodexTokensFromOutput,
    refreshAccountStateIndexForProvider: deps.refreshAccountStateIndexForProvider,
    runDevCommand: deps.runDevCommand,
    devContext: deps.devContext,
    runBackupCommand: deps.runBackupCommand,
    backupContext: deps.backupContext,
    runServerEntry: deps.runServerEntry,
    serverEntryContext: deps.serverEntryContext,
    runAiCliCommandRouter: deps.runAiCliCommandRouter,
    aiCliContext: deps.aiCliContext
  };
}

function createRootDispatchWiring(deps = {}) {
  const contexts = createRootCommandContexts(deps);
  return createRootRouterDeps({
    processObj: deps.processObj,
    consoleImpl: deps.consoleImpl,
    fs: deps.fs,
    buildUsageProbePayload: deps.buildUsageProbePayload,
    showHelp: deps.showHelp,
    showLsHelp: deps.showLsHelp,
    listProfiles: deps.listProfiles,
    runGlobalAccountImport: deps.runGlobalAccountImport,
    parseCodexBulkImportArgs: deps.parseCodexBulkImportArgs,
    importCodexTokensFromOutput: deps.importCodexTokensFromOutput,
    refreshAccountStateIndexForProvider: deps.refreshAccountStateIndexForProvider,
    runDevCommand: deps.runDevCommand,
    runBackupCommand: deps.runBackupCommand,
    runServerEntry: deps.runServerEntry,
    runAiCliCommandRouter: deps.runAiCliCommandRouter,
    devContext: contexts.devContext,
    backupContext: contexts.backupContext,
    serverEntryContext: contexts.serverEntryContext,
    aiCliContext: contexts.aiCliContext
  });
}

module.exports = {
  createRootCommandContexts,
  createRootRouterDeps,
  createRootDispatchWiring
};
