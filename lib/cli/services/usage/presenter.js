'use strict';

function createUsagePresenterService(options = {}) {
  const {
    usageCacheMaxAgeMs,
    readUsageCache,
    ensureUsageSnapshot,
    getClaudeUsageAuthForSandbox,
    checkStatus,
    getProfileDir,
    filterExistingAccountIds,
    getAccountStateIndex,
    getToolAccountIds,
    getDefaultParallelism,
    stateIndexClient,
    isExhausted,
    getMinRemainingPctFromCache
  } = options;

  function formatUsageLabel(cliName, id, accountName) {
    if (accountName && accountName.startsWith('API Key')) {
      return '\x1b[90m[Usage: API Key mode]\x1b[0m';
    }
    const cache = readUsageCache(cliName, id);
    if (!cache || !cache.capturedAt || (Date.now() - cache.capturedAt > usageCacheMaxAgeMs)) {
      return '';
    }

    if (cache.kind === 'gemini_oauth_stats' && Array.isArray(cache.models) && cache.models.length > 0) {
      const hottest = [...cache.models].sort((a, b) => a.remainingPct - b.remainingPct)[0];
      return `\x1b[36m[Usage: ${hottest.model} ${hottest.remainingPct.toFixed(1)}% / ${hottest.resetIn}]\x1b[0m`;
    }

    if (cache.kind === 'codex_oauth_status' && Array.isArray(cache.entries) && cache.entries.length > 0) {
      const withPct = cache.entries
        .filter((x) => typeof x.remainingPct === 'number')
        .sort((a, b) => (Number(b.windowMinutes) || 0) - (Number(a.windowMinutes) || 0))[0];
      if (withPct) {
        const resetSuffix = withPct.resetIn ? ` / ${withPct.resetIn}` : '';
        return `\x1b[36m[Usage: ${withPct.window} ${withPct.remainingPct.toFixed(1)}%${resetSuffix}]\x1b[0m`;
      }
      return `\x1b[36m[Usage: ${cache.entries[0].window}]\x1b[0m`;
    }

    if (cache.kind === 'claude_oauth_usage' && Array.isArray(cache.entries) && cache.entries.length > 0) {
      const withPct = cache.entries
        .filter((x) => typeof x.remainingPct === 'number')
        .sort((a, b) => (Number(b.windowMinutes) || 0) - (Number(a.windowMinutes) || 0))[0];
      if (withPct) {
        const resetSuffix = withPct.resetIn ? ` / ${withPct.resetIn}` : '';
        return `\x1b[36m[Usage: ${withPct.window} ${withPct.remainingPct.toFixed(1)}%${resetSuffix}]\x1b[0m`;
      }
      return `\x1b[36m[Usage: ${cache.entries[0].window}]\x1b[0m`;
    }

    return '';
  }

  function getUsageNoSnapshotHint(cliName, id = null) {
    if (cliName === 'gemini') {
      return 'Ensure this account is logged in (OAuth), then retry.';
    }
    if (cliName === 'codex') {
      return 'Ensure this account is logged in (OAuth), then retry. (`codex login` inside this sandbox if needed)';
    }
    if (cliName === 'claude') {
      if (id !== null && id !== undefined) {
        const auth = getClaudeUsageAuthForSandbox(cliName, id);
        if (!auth) {
          return 'No usable Claude auth token was found in this sandbox. Run `aih claude <id>` and login first.';
        }
        if (auth.mode === 'settings_env_token' && auth.isLocalProxy) {
          return `Detected local provider token (${auth.baseUrl}). Start that provider first, then retry; or login with Claude OAuth.`;
        }
        if (auth.mode === 'settings_env_token') {
          return 'Detected token from settings env. If this provider does not expose /api/oauth/usage, switch to Claude OAuth for usage-remaining.';
        }
      }
      return 'Ensure this account is logged in with OAuth (not API key), then retry.';
    }
    return '';
  }

  function formatUsageSnapshotLines(cache) {
    if (!cache || typeof cache !== 'object') return [];
    if (cache.kind === 'gemini_oauth_stats' && Array.isArray(cache.models)) {
      return cache.models.map((m) => `${m.model}: ${m.remainingPct.toFixed(1)}% (resets in ${m.resetIn})`);
    }
    if (cache.kind === 'codex_oauth_status' && Array.isArray(cache.entries)) {
      return cache.entries.map((x) => {
        if (typeof x.remainingPct === 'number') {
          const resetSuffix = x.resetIn ? ` (resets in ${x.resetIn})` : '';
          return `${x.window}: ${x.remainingPct.toFixed(1)}%${resetSuffix}`;
        }
        return `${x.window}`;
      });
    }
    if (cache.kind === 'claude_oauth_usage' && Array.isArray(cache.entries)) {
      return cache.entries.map((x) => {
        if (typeof x.remainingPct === 'number') {
          const resetSuffix = x.resetIn ? ` (resets in ${x.resetIn})` : '';
          return `${x.window}: ${x.remainingPct.toFixed(1)}%${resetSuffix}`;
        }
        return `${x.window}`;
      });
    }
    return [JSON.stringify(cache)];
  }

  function printUsageSnapshot(cliName, id) {
    const profileDir = getProfileDir(cliName, id);
    const { accountName } = checkStatus(cliName, profileDir);
    if (accountName && accountName.startsWith('API Key')) {
      console.log(`\x1b[90m[aih]\x1b[0m ${cliName} Account ID ${id} is in API Key mode.`);
      console.log(`\x1b[90m[Hint]\x1b[0m OAuth usage-remaining is unavailable for API Key accounts.`);
      return;
    }

    let cache = readUsageCache(cliName, id);
    cache = ensureUsageSnapshot(cliName, id, cache);
    if (!cache) {
      console.log(`\x1b[90m[aih]\x1b[0m No cached usage snapshot for ${cliName} Account ID ${id}.`);
      const hint = getUsageNoSnapshotHint(cliName, id);
      if (hint) {
        console.log(`\x1b[90m[Hint]\x1b[0m ${hint}`);
      }
      return;
    }

    const ageLabel = cache.capturedAt
      ? `${Math.max(0, Math.floor((Date.now() - cache.capturedAt) / 1000))}s`
      : 'unknown';
    console.log(`\x1b[36m[aih]\x1b[0m Usage snapshot for ${cliName} Account ID ${id} (age: ${ageLabel})`);
    const lines = formatUsageSnapshotLines(cache);
    lines.forEach((line) => {
      console.log(`  - ${line}`);
    });
  }

  function buildUsageProbePayload(cliName, id) {
    const profileDir = getProfileDir(cliName, id);
    const { configured, accountName } = checkStatus(cliName, profileDir);
    if (!configured) {
      return { cliName, id, status: 'pending' };
    }
    if (accountName && accountName.startsWith('API Key')) {
      return { cliName, id, status: 'api_key', label: accountName };
    }

    let cache = readUsageCache(cliName, id);
    cache = ensureUsageSnapshot(cliName, id, cache);
    const label = accountName && accountName !== 'Unknown' ? accountName : 'OAuth';
    if (!cache) {
      return {
        cliName,
        id,
        status: 'no_snapshot',
        label,
        hint: getUsageNoSnapshotHint(cliName, id)
      };
    }

    const ageLabel = cache.capturedAt
      ? `${Math.max(0, Math.floor((Date.now() - cache.capturedAt) / 1000))}s`
      : 'unknown';
    return {
      cliName,
      id,
      status: 'ok',
      label,
      ageLabel,
      lines: formatUsageSnapshotLines(cache)
    };
  }

  async function printAllUsageSnapshots(cliName) {
    const indexedOauthIds = filterExistingAccountIds(cliName, getAccountStateIndex().listUsageCandidateIds(cliName));
    const ids = indexedOauthIds.length > 0 ? indexedOauthIds : getToolAccountIds(cliName);
    if (ids.length === 0) {
      console.log(`\x1b[90m[aih]\x1b[0m No accounts found for ${cliName}.`);
      return;
    }

    let oauthCount = 0;
    let withSnapshot = 0;
    let skippedApiKey = 0;
    let skippedPending = 0;
    console.log(`\x1b[36m[aih]\x1b[0m Usage snapshots for ${cliName} (all OAuth accounts)`);

    const maxWorkers = Math.max(1, Math.min(64, getDefaultParallelism()));
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= ids.length) return;
        const id = ids[idx];
        const payload = buildUsageProbePayload(cliName, id);
        if (payload.status === 'pending') {
          stateIndexClient.upsert(cliName, id, {
            configured: false,
            apiKeyMode: false,
            exhausted: false
          });
          skippedPending += 1;
          console.log(`  - Account ID ${id}: Pending Login (skipped)`);
          continue;
        }
        if (payload.status === 'api_key') {
          stateIndexClient.upsert(cliName, id, {
            configured: true,
            apiKeyMode: true,
            exhausted: false
          });
          skippedApiKey += 1;
          console.log(`  - Account ID ${id}: ${payload.label} (API Key mode, skipped)`);
          continue;
        }
        if (payload.status === 'probe_error') {
          oauthCount += 1;
          console.log(`  - Account ID ${id}: usage probe failed (${payload.error || 'unknown'})`);
          continue;
        }

        oauthCount += 1;
        if (payload.status !== 'ok') {
          stateIndexClient.upsert(cliName, id, {
            configured: true,
            apiKeyMode: false,
            exhausted: isExhausted(cliName, id),
            remainingPct: null
          });
          console.log(`  - Account ID ${id} (${payload.label || 'OAuth'}): no cached usage snapshot`);
          if (payload.hint) {
            console.log(`    Hint: ${payload.hint}`);
          }
          continue;
        }

        const cache = readUsageCache(cliName, id);
        stateIndexClient.upsert(cliName, id, {
          configured: true,
          apiKeyMode: false,
          exhausted: isExhausted(cliName, id),
          remainingPct: getMinRemainingPctFromCache(cache)
        });
        withSnapshot += 1;
        console.log(`  - Account ID ${id} (${payload.label}) [age: ${payload.ageLabel}]`);
        (Array.isArray(payload.lines) ? payload.lines : []).forEach((line) => {
          console.log(`    ${line}`);
        });
      }
    };

    const workerCount = Math.min(maxWorkers, ids.length);
    const workers = [];
    for (let i = 0; i < workerCount; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);

    console.log(`\x1b[90m[aih]\x1b[0m Summary: oauth=${oauthCount}, with_snapshot=${withSnapshot}, api_key_skipped=${skippedApiKey}, pending_skipped=${skippedPending}`);
  }

  return {
    formatUsageLabel,
    getUsageNoSnapshotHint,
    formatUsageSnapshotLines,
    printUsageSnapshot,
    buildUsageProbePayload,
    printAllUsageSnapshots
  };
}

module.exports = {
  createUsagePresenterService
};
