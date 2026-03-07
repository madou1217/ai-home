'use strict';

function createCliproxyapiExportService(options = {}) {
  const {
    fs,
    path,
    aiHomeDir,
    hostHomeDir,
    BufferImpl = Buffer
  } = options;

  function decodeBase64UrlJsonSegment(segment) {
    const text = String(segment || '').trim();
    if (!text) return null;
    try {
      const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
      const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
      return JSON.parse(BufferImpl.from(`${normalized}${padding}`, 'base64').toString('utf8'));
    } catch (_error) {
      return null;
    }
  }

  function decodeJwtPayloadUnsafe(jwt) {
    const text = String(jwt || '').trim();
    if (!text) return null;
    const parts = text.split('.');
    if (parts.length < 2) return null;
    return decodeBase64UrlJsonSegment(parts[1]);
  }

  function readJsonFileSafe(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
      return null;
    }
  }

  function stripInlineYamlComment(text) {
    let quote = '';
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === quote && text[i - 1] !== '\\') quote = '';
        continue;
      }
      if (ch === '\'' || ch === '"') {
        quote = ch;
        continue;
      }
      if (ch === '#') return text.slice(0, i).trim();
    }
    return text.trim();
  }

  function normalizeYamlScalar(text) {
    const raw = stripInlineYamlComment(String(text || '').trim());
    if (!raw) return '';
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith('\'') && raw.endsWith('\''))) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  function expandUserPath(targetPath, baseDir) {
    const text = String(targetPath || '').trim();
    if (!text) return '';
    if (text === '~') return hostHomeDir;
    if (text.startsWith('~/') || text.startsWith('~\\')) {
      return path.join(hostHomeDir, text.slice(2));
    }
    if (path.isAbsolute(text)) return text;
    return path.resolve(baseDir, text);
  }

  function resolveCliproxyapiConfigPath() {
    const candidates = [
      path.join(hostHomeDir, '.cli-proxy-api', 'config.yaml'),
      path.join(hostHomeDir, '.cli-proxy-api', 'config.yml')
    ];
    return candidates.find((candidate) => {
      try {
        return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
      } catch (_error) {
        return false;
      }
    }) || '';
  }

  function resolveCliproxyapiAuthDir() {
    const configPath = resolveCliproxyapiConfigPath();
    if (!configPath) {
      return {
        configPath: '',
        authDir: path.join(hostHomeDir, '.cli-proxy-api')
      };
    }

    const yamlText = fs.readFileSync(configPath, 'utf8');
    const lines = yamlText.split(/\r?\n/);
    const baseDir = path.dirname(configPath);
    for (const line of lines) {
      if (!/^\s*auth-dir\s*:/.test(line)) continue;
      const rawValue = line.replace(/^\s*auth-dir\s*:\s*/, '');
      const normalized = normalizeYamlScalar(rawValue);
      return {
        configPath,
        authDir: expandUserPath(normalized, baseDir) || path.join(hostHomeDir, '.cli-proxy-api')
      };
    }

    return {
      configPath,
      authDir: path.join(hostHomeDir, '.cli-proxy-api')
    };
  }

  function toIsoFromUnixSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    return new Date(seconds * 1000).toISOString();
  }

  function extractEmail(idToken, accessToken) {
    const idPayload = decodeJwtPayloadUnsafe(idToken);
    if (idPayload && typeof idPayload.email === 'string' && idPayload.email.trim()) {
      return idPayload.email.trim();
    }
    const accessPayload = decodeJwtPayloadUnsafe(accessToken);
    if (!accessPayload || typeof accessPayload !== 'object') return '';
    if (typeof accessPayload.email === 'string' && accessPayload.email.trim()) {
      return accessPayload.email.trim();
    }
    const profile = accessPayload['https://api.openai.com/profile'];
    if (profile && typeof profile.email === 'string' && profile.email.trim()) {
      return profile.email.trim();
    }
    return '';
  }

  function extractExpireIso(idToken, accessToken) {
    const accessPayload = decodeJwtPayloadUnsafe(accessToken);
    if (accessPayload && accessPayload.exp) {
      return toIsoFromUnixSeconds(accessPayload.exp);
    }
    const idPayload = decodeJwtPayloadUnsafe(idToken);
    if (idPayload && idPayload.exp) {
      return toIsoFromUnixSeconds(idPayload.exp);
    }
    return '';
  }

  function buildCliproxyapiCodexAuth(authJson) {
    if (!authJson || typeof authJson !== 'object') return null;
    const tokens = authJson.tokens && typeof authJson.tokens === 'object' ? authJson.tokens : null;
    if (!tokens) return null;

    const refreshToken = String(tokens.refresh_token || '').trim();
    if (!refreshToken.startsWith('rt_')) return null;

    const idToken = String(tokens.id_token || '').trim();
    const accessToken = String(tokens.access_token || '').trim();
    const accountId = String(tokens.account_id || '').trim();
    const lastRefresh = String(authJson.last_refresh || '').trim() || new Date().toISOString();
    const payload = {
      type: 'codex',
      email: extractEmail(idToken, accessToken),
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      account_id: accountId,
      last_refresh: lastRefresh
    };
    const expired = extractExpireIso(idToken, accessToken);
    if (expired) payload.expired = expired;
    return payload;
  }

  function buildIdentityKey(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const accountId = String(payload.account_id || '').trim().toLowerCase();
    if (accountId) return `account_id:${accountId}`;
    const email = String(payload.email || '').trim().toLowerCase();
    if (email) return `email:${email}`;
    return '';
  }

  function isManagedCodexExportFile(fileName) {
    return /^codex-aih-\d+\.json$/i.test(String(fileName || '').trim());
  }

  function isCodexAuthPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (String(payload.type || '').trim().toLowerCase() === 'codex') return true;
    const refreshToken = String(payload.refresh_token || '').trim();
    return refreshToken.startsWith('rt_');
  }

  function listExistingAuthFiles(authDir) {
    try {
      return fs.readdirSync(authDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.json$/i.test(String(entry.name || '')))
        .map((entry) => {
          const fileName = String(entry.name);
          const filePath = path.join(authDir, fileName);
          const payload = readJsonFileSafe(filePath);
          return {
            fileName,
            filePath,
            payload,
            identityKey: buildIdentityKey(payload),
            isCodex: isCodexAuthPayload(payload),
            isManaged: isManagedCodexExportFile(fileName)
          };
        });
    } catch (_error) {
      return [];
    }
  }

  function listCodexAccountIds() {
    const providerDir = path.join(aiHomeDir, 'profiles', 'codex');
    try {
      return fs.readdirSync(providerDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d+$/.test(String(entry.name || '')))
        .map((entry) => String(entry.name))
        .sort((a, b) => Number(a) - Number(b));
    } catch (_error) {
      return [];
    }
  }

  function exportCliproxyapiCodexAuths() {
    const resolved = resolveCliproxyapiAuthDir();
    fs.mkdirSync(resolved.authDir, { recursive: true });

    const existingFiles = listExistingAuthFiles(resolved.authDir);
    const existingByIdentity = new Map();
    existingFiles.forEach((entry) => {
      if (!entry.isCodex || !entry.identityKey) return;
      if (!existingByIdentity.has(entry.identityKey)) {
        existingByIdentity.set(entry.identityKey, []);
      }
      existingByIdentity.get(entry.identityKey).push(entry);
    });

    const ids = listCodexAccountIds();
    let exported = 0;
    let skippedMissing = 0;
    let skippedInvalid = 0;
    let dedupedSource = 0;
    let dedupedTarget = 0;
    const files = [];
    const seenSourceIdentity = new Set();
    const keptManagedTargets = new Set();

    ids.forEach((id) => {
      const authPath = path.join(aiHomeDir, 'profiles', 'codex', id, '.codex', 'auth.json');
      if (!fs.existsSync(authPath)) {
        skippedMissing += 1;
        return;
      }
      const authJson = readJsonFileSafe(authPath);
      const payload = buildCliproxyapiCodexAuth(authJson);
      if (!payload) {
        skippedInvalid += 1;
        return;
      }
      const identityKey = buildIdentityKey(payload);
      if (identityKey && seenSourceIdentity.has(identityKey)) {
        dedupedSource += 1;
        return;
      }
      if (identityKey) seenSourceIdentity.add(identityKey);

      const existingMatches = identityKey ? (existingByIdentity.get(identityKey) || []) : [];
      const preferredExisting = existingMatches.find((entry) => !entry.isManaged) || existingMatches[0] || null;
      const fileName = preferredExisting ? preferredExisting.fileName : `codex-aih-${id}.json`;
      const outPath = path.join(resolved.authDir, fileName);
      fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
      exported += 1;
      if (isManagedCodexExportFile(fileName)) keptManagedTargets.add(fileName);
      files.push({ id, outPath, email: payload.email, identityKey });
    });

    existingFiles.forEach((entry) => {
      if (!entry.isManaged || !entry.isCodex || !entry.identityKey) return;
      if (!seenSourceIdentity.has(entry.identityKey)) return;
      const matches = existingByIdentity.get(entry.identityKey) || [];
      const managedMatches = matches.filter((item) => item.isManaged);
      if (keptManagedTargets.has(entry.fileName)) return;
      if (managedMatches.length <= 1 && matches.some((item) => !item.isManaged)) {
        try {
          fs.unlinkSync(entry.filePath);
          dedupedTarget += 1;
        } catch (_error) {}
        return;
      }
      if (managedMatches.length <= 1) return;
      try {
        fs.unlinkSync(entry.filePath);
        dedupedTarget += 1;
      } catch (_error) {}
    });

    return {
      provider: 'codex',
      configPath: resolved.configPath,
      authDir: resolved.authDir,
      scanned: ids.length,
      exported,
      skippedMissing,
      skippedInvalid,
      dedupedSource,
      dedupedTarget,
      files
    };
  }

  return {
    exportCliproxyapiCodexAuths
  };
}

module.exports = {
  createCliproxyapiExportService
};
