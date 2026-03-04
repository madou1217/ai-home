'use strict';

function listChildDirectories(fs, path, dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isDirectory())
    .sort();
}

function readFilePreview(fs, filePath, size = 256) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const out = Buffer.alloc(size);
    const bytesRead = fs.readSync(fd, out, 0, size, 0);
    return out.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function isNumericAccountId(name) {
  return /^\d+$/.test(String(name || ''));
}

function collectCredentialRelativePaths(provider) {
  const hiddenDir = `.${String(provider || '').trim()}`;
  return [
    '.aih_env.json',
    `${hiddenDir}/auth.json`,
    `${hiddenDir}/oauth_creds.json`,
    `${hiddenDir}/oauth.json`,
    `${hiddenDir}/token.json`,
    `${hiddenDir}/tokens.json`,
    `${hiddenDir}/credentials.json`,
    `${hiddenDir}/.credentials.json`,
    `${hiddenDir}/settings.json`,
    `${hiddenDir}/google_accounts.json`
  ];
}

function collectSelectedAccountDirs({ fs, path, aiHomeDir, targetPaths }) {
  const profilesRoot = path.join(aiHomeDir, 'profiles');
  if (!fs.existsSync(profilesRoot) || !fs.statSync(profilesRoot).isDirectory()) return [];

  const selected = new Map();
  const addAccount = (provider, id) => {
    if (!provider || !isNumericAccountId(id)) return;
    const key = `${provider}:${id}`;
    if (selected.has(key)) return;
    const profileDir = path.join(profilesRoot, provider, String(id));
    if (!fs.existsSync(profileDir) || !fs.statSync(profileDir).isDirectory()) return;
    selected.set(key, { provider, id: String(id), profileDir });
  };

  const addProviderAccounts = (provider) => {
    const providerDir = path.join(profilesRoot, provider);
    if (!fs.existsSync(providerDir) || !fs.statSync(providerDir).isDirectory()) return;
    fs.readdirSync(providerDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isNumericAccountId(entry.name))
      .forEach((entry) => addAccount(provider, entry.name));
  };

  const seen = new Set(Array.isArray(targetPaths) ? targetPaths : []);
  if (seen.has('profiles')) {
    fs.readdirSync(profilesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => addProviderAccounts(entry.name));
    return Array.from(selected.values());
  }

  Array.from(seen).forEach((raw) => {
    const rel = String(raw || '').trim();
    if (!rel || !rel.startsWith('profiles/')) return;
    const parts = rel.split('/').filter(Boolean);
    if (parts.length < 2) return;

    const provider = parts[1];
    if (parts.length === 2) {
      addProviderAccounts(provider);
      return;
    }

    addAccount(provider, parts[2]);
  });

  return Array.from(selected.values());
}

function stageSelectedProfilesAsAccounts({ fs, path, fse, aiHomeDir, targetPaths, stageRoot }) {
  const accountsDir = path.join(stageRoot, 'accounts');
  fse.ensureDirSync(accountsDir);
  const providerSet = new Set();
  let copiedAccounts = 0;
  let copiedFiles = 0;

  const selectedAccounts = collectSelectedAccountDirs({
    fs,
    path,
    aiHomeDir,
    targetPaths
  });

  selectedAccounts.forEach((account) => {
    const relFiles = collectCredentialRelativePaths(account.provider);
    let accountCopied = false;
    relFiles.forEach((relFile) => {
      const src = path.join(account.profileDir, relFile);
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return;

      const dst = path.join(accountsDir, account.provider, account.id, relFile);
      fse.ensureDirSync(path.dirname(dst));
      fse.copySync(src, dst, { overwrite: true });
      copiedFiles += 1;
      accountCopied = true;
    });

    if (accountCopied) {
      copiedAccounts += 1;
      providerSet.add(account.provider);
    }
  });

  return {
    accountsDir,
    copiedAccounts,
    copiedFiles,
    providerDirs: Array.from(providerSet).sort()
  };
}

function summarizeAccountImportResult(result) {
  const out = {
    providers: [],
    imported: 0,
    duplicates: 0,
    invalid: 0,
    failed: 0
  };
  if (!result || typeof result !== 'object') return out;
  out.providers = Array.isArray(result.providers) ? result.providers.slice() : [];
  const providerResults = Array.isArray(result.providerResults) ? result.providerResults : [];
  providerResults.forEach((item) => {
    out.imported += Number(item.imported || 0);
    out.duplicates += Number(item.duplicates || 0);
    out.invalid += Number(item.invalid || 0);
    out.failed += Number(item.failed || 0);
  });
  return out;
}

async function runBackupCommand(cmd, args, deps = {}) {
  if (cmd !== 'export' && cmd !== 'import') return false;

  const {
    fs,
    path,
    os,
    fse,
    execSync,
    readline,
    consoleImpl,
    processImpl,
    hasAgeBinary,
    tryAutoInstallAge,
    getAgeCompatibleSshPrivateKeys,
    getSshKeys,
    isAgeArmoredData,
    runAgeDecrypt,
    loadRsaPrivateKey,
    decryptSshRsaEnvelope,
    isPasswordArchiveFile,
    encryptTarWithPassword,
    decryptPasswordArchive,
    buildPasswordEnvelope,
    decryptPasswordEnvelope,
    parseEnvelope,
    decryptLegacyEnvelope,
    ensureAesSuffix,
    defaultExportName,
    parseExportArgs,
    parseImportArgs,
    expandSelectorsToPaths,
    renderStageProgress,
    restoreProfilesFromExtractedBackup,
    runGlobalAccountImport,
    parseCodexBulkImportArgs,
    importCodexTokensFromOutput
  } = deps;

  if (cmd === 'export') {
    const { targetFile: parsedTargetFile, selectors } = parseExportArgs(args.slice(1));
    const targetFile = ensureAesSuffix(parsedTargetFile || defaultExportName());

    const targetPaths = expandSelectorsToPaths(selectors);
    if (selectors.length > 0) {
      if (targetPaths.length === 0) {
        consoleImpl.error('\x1b[31m[aih] No matching profiles found for the given selectors.\x1b[0m');
        processImpl.exit(1);
        return true;
      }
      consoleImpl.log(`\x1b[36m[aih]\x1b[0m Preparing export targets:\n  - ${targetPaths.join('\n  - ')}`);
    } else {
      consoleImpl.log('\x1b[36m[aih]\x1b[0m Exporting credential files only (account-import compatible layout: accounts/<provider>/<id>/...).');
    }

    const password = readline.question('Enter export password: ', { hideEchoBack: true });
    const passwordConfirm = readline.question('Confirm password: ', { hideEchoBack: true });
    if (password !== passwordConfirm) {
      consoleImpl.error('\n\x1b[31m[aih] Passwords do not match.\x1b[0m');
      processImpl.exit(1);
      return true;
    }
    if (!password) {
      consoleImpl.error('\n\x1b[31m[aih] Password cannot be empty.\x1b[0m');
      processImpl.exit(1);
      return true;
    }

    const tmpTar = path.join(os.tmpdir(), `aih_backup_${Date.now()}.tar.gz`);
    const tmpStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih_export_stage_'));
    let exitCode = 0;

    try {
      const exportStages = 4;
      renderStageProgress('[aih export]', 1, exportStages, 'Packaging accounts');
      const staged = stageSelectedProfilesAsAccounts({
        fs,
        path,
        fse,
        aiHomeDir: deps.aiHomeDir,
        targetPaths,
        stageRoot: tmpStageDir
      });
      if (staged.copiedAccounts === 0 || staged.copiedFiles === 0) {
        throw new Error('No credential files found in selected accounts.');
      }
      execSync(`tar -czf "${tmpTar}" -C "${tmpStageDir}" "accounts"`, { stdio: 'ignore' });

      const outPath = path.resolve(targetFile);
      renderStageProgress('[aih export]', 2, exportStages, 'Encrypting archive');
      await encryptTarWithPassword(tmpTar, outPath, password);

      renderStageProgress('[aih export]', 3, exportStages, 'Finalizing output');
      renderStageProgress('[aih export]', 4, exportStages, 'Completed');
      consoleImpl.log(`\x1b[90m[aih]\x1b[0m exported providers=${staged.providerDirs.join(', ')} accounts=${staged.copiedAccounts} files=${staged.copiedFiles}`);
      consoleImpl.log(`\x1b[32m[Success] Backup exported:\x1b[0m ${outPath}`);
    } catch (error) {
      exitCode = 1;
      consoleImpl.error(`\n\x1b[31m[Error] Failed to export: ${error.message}\x1b[0m`);
    } finally {
      if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar);
      if (fs.existsSync(tmpStageDir)) fse.removeSync(tmpStageDir);
    }

    processImpl.exit(exitCode);
    return true;
  }

  let targetFile = '';
  let overwriteExisting = false;
  try {
    const parsed = parseImportArgs(args.slice(1));
    targetFile = parsed.targetFile;
    overwriteExisting = parsed.overwrite;
  } catch (error) {
    consoleImpl.error(`\x1b[31m[aih] ${error.message}. Usage: aih import [-o] <file.aes>\x1b[0m`);
    processImpl.exit(1);
    return true;
  }

  if (!targetFile || !fs.existsSync(targetFile)) {
    consoleImpl.error('\x1b[31m[aih] File not found. Usage: aih import [-o] <file.aes>\x1b[0m');
    processImpl.exit(1);
    return true;
  }

  const targetPath = path.resolve(targetFile);
  const tmpTar = path.join(os.tmpdir(), `aih_backup_${Date.now()}.tar.gz`);
  const tmpExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih_restore_'));
  let exitCode = 0;

  try {
    const importStages = 4;
    renderStageProgress('[aih import]', 1, importStages, 'Decrypting backup');

    let decrypted = null;
    let tarReady = false;

    if (isPasswordArchiveFile(targetPath)) {
      const password = readline.question('Enter backup password: ', { hideEchoBack: true });
      if (!password) throw new Error('Password cannot be empty.');
      await decryptPasswordArchive(targetPath, tmpTar, password);
      tarReady = true;
    } else {
      const preview = readFilePreview(fs, targetPath, 256);
      const looksLikeAge = isAgeArmoredData(preview);
      if (looksLikeAge) {
        if (!hasAgeBinary()) {
          const installed = tryAutoInstallAge();
          if (!installed && !hasAgeBinary()) {
            throw new Error('This backup uses age, but age CLI is not installed.');
          }
        }
        const ageKeys = getAgeCompatibleSshPrivateKeys();
        if (ageKeys.length === 0) {
          throw new Error('No AGE-compatible SSH private keys found under ~/.ssh.');
        }
        const idx = readline.keyInSelect(
          ageKeys.map((k) => `~/.ssh/${k.privateFile} (${k.keyType})`),
          'Choose SSH private key for age decryption:'
        );
        if (idx === -1) {
          consoleImpl.log('Operation cancelled.');
          processImpl.exit(0);
          return true;
        }
        runAgeDecrypt(targetPath, tmpTar, ageKeys[idx].privatePath);
        tarReady = true;
        consoleImpl.log(`\x1b[36m[aih]\x1b[0m Decrypted with ~/.ssh/${ageKeys[idx].privateFile}.`);
      } else {
        const data = fs.readFileSync(targetPath);
        const envelope = parseEnvelope(data);

        if (envelope) {
          if (envelope.mode === 'password') {
            const password = readline.question('Enter decryption password: ', { hideEchoBack: true });
            if (!password) throw new Error('Password cannot be empty.');
            decrypted = decryptPasswordEnvelope(envelope, password);
          } else if (envelope.mode === 'ssh-rsa') {
            let privateKeyObj = null;
            if (envelope.keyHint) {
              const hintPath = path.join(deps.hostHomeDir, '.ssh', envelope.keyHint);
              if (fs.existsSync(hintPath)) {
                try {
                  privateKeyObj = loadRsaPrivateKey(hintPath, '');
                  decrypted = decryptSshRsaEnvelope(envelope, privateKeyObj);
                  consoleImpl.log(`\x1b[36m[aih]\x1b[0m Auto-unlocked with ~/.ssh/${envelope.keyHint}.`);
                } catch (_error) {}
              }
            }

            if (!decrypted) {
              const rsaKeys = deps.getLikelyRsaSshPrivateKeys();
              if (rsaKeys.length === 0) {
                throw new Error('No RSA SSH private keys found under ~/.ssh (required for ssh-rsa encrypted backup).');
              }
              const idx = readline.keyInSelect(rsaKeys.map((k) => `~/.ssh/${k}`), 'Choose SSH RSA private key for decryption:');
              if (idx === -1) {
                consoleImpl.log('Operation cancelled.');
                processImpl.exit(0);
                return true;
              }
              const keyName = rsaKeys[idx];
              const keyPath = path.join(deps.hostHomeDir, '.ssh', keyName);
              let passphrase = '';
              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  privateKeyObj = loadRsaPrivateKey(keyPath, passphrase);
                  decrypted = decryptSshRsaEnvelope(envelope, privateKeyObj);
                  break;
                } catch (error) {
                  if (attempt === 2) throw error;
                  passphrase = readline.question(`Passphrase for ~/.ssh/${keyName} (leave empty if none): `, { hideEchoBack: true });
                }
              }
            }
          } else {
            throw new Error(`Unsupported envelope mode: ${envelope.mode}`);
          }
        } else {
          consoleImpl.log('\x1b[33m[aih]\x1b[0m Legacy backup format detected.');
          const sshKeys = getSshKeys();
          const options = ['Password (legacy AES)', ...sshKeys.map((k) => `Legacy SSH-key secret: ~/.ssh/${k}`)];
          const index = readline.keyInSelect(options, 'Choose legacy decryption method:');
          if (index === -1) {
            consoleImpl.log('Operation cancelled.');
            processImpl.exit(0);
            return true;
          }
          let secret = '';
          if (index === 0) {
            secret = readline.question('Enter legacy decryption password: ', { hideEchoBack: true });
          } else {
            const sshKeyName = sshKeys[index - 1];
            secret = fs.readFileSync(path.join(deps.hostHomeDir, '.ssh', sshKeyName), 'utf8');
          }
          if (!secret) throw new Error('Decryption secret cannot be empty.');
          decrypted = decryptLegacyEnvelope(data, secret);
        }
      }
    }

    if (!tarReady) {
      fs.writeFileSync(tmpTar, decrypted);
    }

    renderStageProgress('[aih import]', 2, importStages, 'Extracting backup archive');
    execSync(`tar -xzf "${tmpTar}" -C "${tmpExtractDir}"`, { stdio: 'ignore' });

    renderStageProgress('[aih import]', 3, importStages, 'Restoring accounts');

    const accountsDir = path.join(tmpExtractDir, 'accounts');
    const profilesDir = path.join(tmpExtractDir, 'profiles');
    const hasAccountsDir = fs.existsSync(accountsDir) && fs.statSync(accountsDir).isDirectory();

    let accountImportSummary = {
      providers: [],
      imported: 0,
      duplicates: 0,
      invalid: 0,
      failed: 0
    };

    if (hasAccountsDir) {
      if (overwriteExisting) {
        consoleImpl.log('\x1b[90m[aih]\x1b[0m -o/--overwrite only applies to fallback raw profile restore.');
      }

      const allProviders = listChildDirectories(fs, path, accountsDir);
      let importedProviders = [];
      try {
        const importResult = await runGlobalAccountImport([accountsDir], {
          fs,
          log: (line) => consoleImpl.log(line),
          error: (line) => consoleImpl.error(line),
          parseCodexBulkImportArgs,
          importCodexTokensFromOutput
        });
        accountImportSummary = summarizeAccountImportResult(importResult);
        importedProviders = accountImportSummary.providers;
      } catch (error) {
        if (!/No supported importers found/.test(String(error.message || ''))) {
          throw error;
        }
        consoleImpl.log('\x1b[90m[aih]\x1b[0m No supported provider importer found. Falling back to raw profile restore.');
      }

      const unsupportedProviders = allProviders.filter((provider) => !importedProviders.includes(provider));
      if (unsupportedProviders.length > 0) {
        const fallbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aih_restore_profiles_'));
        try {
          const fallbackProfilesDir = path.join(fallbackRoot, 'profiles');
          fse.ensureDirSync(fallbackProfilesDir);
          unsupportedProviders.forEach((provider) => {
            const src = path.join(accountsDir, provider);
            const dst = path.join(fallbackProfilesDir, provider);
            fse.copySync(src, dst, { overwrite: true });
          });

          const summary = restoreProfilesFromExtractedBackup(
            fallbackRoot,
            overwriteExisting,
            (processed, total, label) => {
              if (total > 0) {
                renderStageProgress('  [restore]', processed, total, label);
              }
            }
          );

          if (summary.totalAccounts === 0) {
            consoleImpl.log('\x1b[90m[aih]\x1b[0m No account directories found in fallback restore set.');
          }
          if (summary.skipped > 0 && !overwriteExisting) {
            consoleImpl.log(`\x1b[33m[aih]\x1b[0m Skipped existing accounts: ${summary.skipped} (use -o to overwrite).`);
          }
          deps.printRestoreDetails('[Imported]', '\x1b[32m', summary.importedAccounts);
          deps.printRestoreDetails('[Overwritten]', '\x1b[33m', summary.overwrittenAccounts);
          deps.printRestoreDetails('[Skipped]', '\x1b[90m', summary.skippedAccounts);
          consoleImpl.log(`\x1b[90m[aih]\x1b[0m fallback raw restore providers=${unsupportedProviders.join(', ')} imported=${summary.imported}, overwritten=${summary.overwritten}, skipped=${summary.skipped}`);
        } finally {
          if (fs.existsSync(fallbackRoot)) fse.removeSync(fallbackRoot);
        }
      }
    } else if (fs.existsSync(profilesDir) && fs.statSync(profilesDir).isDirectory()) {
      const summary = restoreProfilesFromExtractedBackup(
        tmpExtractDir,
        overwriteExisting,
        (processed, total, label) => {
          if (total > 0) {
            renderStageProgress('  [restore]', processed, total, label);
          }
        }
      );

      if (summary.totalAccounts === 0) {
        consoleImpl.log('\x1b[90m[aih]\x1b[0m No account directories found in backup.');
      }
      if (summary.skipped > 0 && !overwriteExisting) {
        consoleImpl.log(`\x1b[33m[aih]\x1b[0m Skipped existing accounts: ${summary.skipped} (use -o to overwrite).`);
      }
      deps.printRestoreDetails('[Imported]', '\x1b[32m', summary.importedAccounts);
      deps.printRestoreDetails('[Overwritten]', '\x1b[33m', summary.overwrittenAccounts);
      deps.printRestoreDetails('[Skipped]', '\x1b[90m', summary.skippedAccounts);
      consoleImpl.log(`\x1b[90m[aih]\x1b[0m legacy profile restore imported=${summary.imported}, overwritten=${summary.overwritten}, skipped=${summary.skipped}`);
    } else {
      throw new Error('Backup archive does not contain accounts/ or profiles/ directory.');
    }

    renderStageProgress('[aih import]', 4, importStages, 'Completed');
    consoleImpl.log(`\x1b[32m[Success] Restore completed!\x1b[0m account_import providers=${accountImportSummary.providers.join(', ') || 'none'} imported=${accountImportSummary.imported}, duplicates=${accountImportSummary.duplicates}, invalid=${accountImportSummary.invalid}, failed=${accountImportSummary.failed}`);
  } catch (error) {
    exitCode = 1;
    consoleImpl.error(`\n\x1b[31m[Error] Failed to import: ${error.message}\x1b[0m`);
  } finally {
    if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar);
    if (fs.existsSync(tmpExtractDir)) fse.removeSync(tmpExtractDir);
  }

  processImpl.exit(exitCode);
  return true;
}

module.exports = {
  runBackupCommand
};
