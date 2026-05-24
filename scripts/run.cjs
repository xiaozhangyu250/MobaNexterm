#!/usr/bin/env node
/* eslint-disable */
// Cross-platform launcher that unsets Electron-as-Node env vars before invoking
// electron-vite. Some shells (notably various Linux desktop configurations) leak
// ELECTRON_RUN_AS_NODE=1 into the environment, which forces Electron's main
// process to run as plain Node and breaks `require('electron')` API access.

const { spawn } = require('node:child_process');
const path = require('node:path');

const cmd = process.argv[2];
if (!cmd || !['dev', 'build', 'preview'].includes(cmd)) {
  console.error('Usage: node scripts/run.cjs <dev|build|preview>');
  process.exit(2);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const isWin = process.platform === 'win32';
const binDir = path.join(__dirname, '..', 'node_modules', '.bin');
const exe = path.join(binDir, isWin ? 'electron-vite.cmd' : 'electron-vite');

const child = spawn(exe, [cmd], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
