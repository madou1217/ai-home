'use strict';

function runBackupCommand(cmd, args, deps = {}) {
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
    getAgeCompatibleSshPublicKeys,
    getAgeCompatibleSshPrivateKeys,
    getSshKeys,
    isAgeArmoredData,
    runAgeEncrypt,
    runAgeDecrypt,
    loadRsaPrivateKey,
    decryptSshRsaEnvelope,
    buildPasswordEnvelope,
    decryptPasswordEnvelope,
    parseEnvelope,
    decryptLegacyEnvelope,
    serializeEnvelope,
    ensureAesSuffix,
    defaultExportName,
    parseExportArgs,
    parseImportArgs,
    expandSelectorsToPaths,
    renderStageProgress,
    restoreProfilesFromExtractedBackup
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
      consoleImpl.log(`\x1b[36m[aih]\x1b[0m This will encrypt the following targets:\n  - ${targetPaths.join('\n  - ')}`);
    } else {
      consoleImpl.log('\x1b[36m[aih]\x1b[0m This will encrypt your entire ~/.ai_home/profiles directory (including API Keys and Tokens).');
    }

    let ageAvailable = hasAgeBinary();
    if (!ageAvailable) {
      const installed = tryAutoInstallAge();
      ageAvailable = installed || hasAgeBinary();
    }

    const agePublicKeys = ageAvailable ? getAgeCompatibleSshPublicKeys() : [];
    if (!ageAvailable) {
      consoleImpl.log('\x1b[33m[aih]\x1b[0m age CLI not found. SSH-key encryption is unavailable; password mode only.');
    } else if (agePublicKeys.length === 0) {
      consoleImpl.log('\x1b[33m[aih]\x1b[0m No AGE-compatible SSH public keys found (~/.ssh/id_*.pub with ssh-ed25519/ssh-rsa).');
    }

    const options = ['Password (AES-256-GCM)', ...agePublicKeys.map((k) => `AGE SSH Key: ~/.ssh/${k.pubFile} (${k.keyType})`)];
    const index = readline.keyInSelect(options, 'Choose encryption method:');
    if (index === -1) {
      consoleImpl.log('Operation cancelled.');
      processImpl.exit(0);
      return true;
    }

    let mode = 'password';
    let password = '';
    let ageRecipient = null;

    if (index === 0) {
      password = readline.question('Enter an encryption password: ', { hideEchoBack: true });
      const pwdConfirm = readline.question('Confirm password: ', { hideEchoBack: true });
      if (password !== pwdConfirm) {
        consoleImpl.error('\n\x1b[31m[aih] Passwords do not match.\x1b[0m');
        processImpl.exit(1);
        return true;
      }
      if (!password) {
        consoleImpl.error('\n\x1b[31m[aih] Password cannot be empty.\x1b[0m');
        processImpl.exit(1);
        return true;
      }
    } else {
      mode = 'age-ssh';
      ageRecipient = agePublicKeys[index - 1];
      if (!ageRecipient) {
        consoleImpl.error('\n\x1b[31m[aih] Invalid SSH key selection.\x1b[0m');
        processImpl.exit(1);
        return true;
      }
      consoleImpl.log(`\x1b[32mSelected AGE SSH key: ${ageRecipient.pubFile} (${ageRecipient.keyType})\x1b[0m`);
    }

    const tmpTar = path.join(os.tmpdir(), `aih_backup_${Date.now()}.tar.gz`);
    try {
      const exportStages = 4;
      renderStageProgress('[aih export]', 1, exportStages, 'Packaging profiles');
      const pathsArg = targetPaths.map((p) => `"${p}"`).join(' ');
      execSync(`tar -czf "${tmpTar}" -C "${deps.aiHomeDir}" ${pathsArg}`, { stdio: 'ignore' });

      const outPath = path.resolve(targetFile);
      renderStageProgress('[aih export]', 2, exportStages, 'Encrypting backup');
      if (mode === 'password') {
        const input = fs.readFileSync(tmpTar);
        const envelope = buildPasswordEnvelope(input, password);
        renderStageProgress('[aih export]', 3, exportStages, 'Writing encrypted file');
        fs.writeFileSync(outPath, serializeEnvelope(envelope));
      } else {
        runAgeEncrypt(tmpTar, outPath, ageRecipient.recipient);
        renderStageProgress('[aih export]', 3, exportStages, 'Writing encrypted file');
      }
      renderStageProgress('[aih export]', 4, exportStages, 'Completed');
      const modeLabel = mode === 'password' ? 'password' : `age-ssh (${ageRecipient.pubFile})`;
      consoleImpl.log(`\x1b[32m[Success] Assets securely exported to:\x1b[0m ${outPath} \x1b[90m[mode: ${modeLabel}]\x1b[0m`);
    } catch (error) {
      consoleImpl.error(`\n\x1b[31m[Error] Failed to export: ${error.message}\x1b[0m`);
    } finally {
      if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar);
    }
    processImpl.exit(0);
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

  const tmpTar = path.join(os.tmpdir(), `aih_backup_${Date.now()}.tar.gz`);
  const tmpExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih_restore_'));

  try {
    const importStages = 4;
    renderStageProgress('[aih import]', 1, importStages, 'Decrypting backup');
    const data = fs.readFileSync(targetFile);
    const envelope = parseEnvelope(data);
    let decrypted = null;
    let tarReady = false;

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
    } else if (isAgeArmoredData(data)) {
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
      runAgeDecrypt(path.resolve(targetFile), tmpTar, ageKeys[idx].privatePath);
      tarReady = true;
      consoleImpl.log(`\x1b[36m[aih]\x1b[0m Decrypted with ~/.ssh/${ageKeys[idx].privateFile}.`);
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

    if (!tarReady) {
      fs.writeFileSync(tmpTar, decrypted);
    }
    renderStageProgress('[aih import]', 2, importStages, 'Extracting backup archive');
    execSync(`tar -xzf "${tmpTar}" -C "${tmpExtractDir}"`, { stdio: 'ignore' });
    renderStageProgress('[aih import]', 3, importStages, 'Restoring account profiles');
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
    renderStageProgress('[aih import]', 4, importStages, 'Completed');

    if (summary.skipped > 0 && !overwriteExisting) {
      consoleImpl.log(`\x1b[33m[aih]\x1b[0m Skipped existing accounts: ${summary.skipped} (use -o to overwrite).`);
    }

    deps.printRestoreDetails('[Imported]', '\x1b[32m', summary.importedAccounts);
    deps.printRestoreDetails('[Overwritten]', '\x1b[33m', summary.overwrittenAccounts);
    deps.printRestoreDetails('[Skipped]', '\x1b[90m', summary.skippedAccounts);
    consoleImpl.log(`\x1b[32m[Success] Restore completed!\x1b[0m imported=${summary.imported}, overwritten=${summary.overwritten}, skipped=${summary.skipped}`);
  } catch (error) {
    consoleImpl.error(`\n\x1b[31m[Error] Failed to import: ${error.message}\x1b[0m`);
  } finally {
    if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar);
    if (fs.existsSync(tmpExtractDir)) fse.removeSync(tmpExtractDir);
  }
  processImpl.exit(0);
  return true;
}

module.exports = {
  runBackupCommand
};
