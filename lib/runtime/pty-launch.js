const path = require('path');

function buildPtyLaunch(cliBin, args, options = {}) {
  const platform = options.platform || process.platform;
  const windowsCommandName = String(options.windowsCommandName || '').trim();
  const normalizedArgs = Array.isArray(args) ? args.map((x) => String(x)) : [];

  if (platform !== 'win32') {
    return { command: String(cliBin), args: normalizedArgs };
  }

  const ext = path.extname(String(cliBin || '')).toLowerCase();
  const requiresCmdWrapper = !ext || ext === '.cmd' || ext === '.bat';
  if (!requiresCmdWrapper) {
    return { command: String(cliBin), args: normalizedArgs };
  }

  const entry = ext ? String(cliBin) : (windowsCommandName || String(cliBin));
  return {
    command: 'cmd.exe',
    args: ['/d', '/c', entry, ...normalizedArgs]
  };
}

module.exports = {
  buildPtyLaunch
};
