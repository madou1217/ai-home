const path = require('path');

function quoteForCmd(arg) {
  const text = String(arg || '');
  if (text.length === 0) return '""';
  return `"${text.replace(/"/g, '""')}"`;
}

function buildPtyLaunch(cliBin, args, options = {}) {
  const platform = options.platform || process.platform;
  const normalizedArgs = Array.isArray(args) ? args.map((x) => String(x)) : [];

  if (platform !== 'win32') {
    return { command: String(cliBin), args: normalizedArgs };
  }

  const ext = path.extname(String(cliBin || '')).toLowerCase();
  const requiresCmdWrapper = !ext || ext === '.cmd' || ext === '.bat';
  if (!requiresCmdWrapper) {
    return { command: String(cliBin), args: normalizedArgs };
  }

  const commandLine = [quoteForCmd(cliBin), ...normalizedArgs.map(quoteForCmd)].join(' ');
  const wrappedLine = `chcp 65001>nul & ${commandLine}`;
  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', wrappedLine]
  };
}

module.exports = {
  buildPtyLaunch
};
