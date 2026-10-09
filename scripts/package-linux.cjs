#!/usr/bin/env node
/* eslint-disable no-console */
const { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const packageJsonPath = join(root, 'package.json');
const packageLockPath = join(root, 'package-lock.json');
const releaseDir = join(root, 'release');

const args = process.argv.slice(2);

function argValue(name) {
  const withEquals = args.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasArg(name) {
  return args.includes(name);
}

function usage() {
  console.log(`Usage:
  npm run package:linux -- --version 1.2.3
  npm run package:linux -- --version 1.2.3 --targets deb
  npm run package:linux -- --skip-checks

Options:
  --version <semver>      Write version into package.json/package-lock.json before packaging.
  --targets <list>        Comma-separated electron-builder linux targets. Default: deb,AppImage.
  --skip-checks           Skip typecheck before build.
  --help                  Show this help.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE ?? join(root, '.cache', 'electron-builder'),
      ELECTRON_CACHE: process.env.ELECTRON_CACHE ?? join(root, '.cache', 'electron'),
    },
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version "${version}". Expected semver, for example 1.2.3.`);
  }
}

function syncVersion(version) {
  const pkg = readJson(packageJsonPath);
  pkg.version = version;
  writeJson(packageJsonPath, pkg);

  if (existsSync(packageLockPath)) {
    const lock = readJson(packageLockPath);
    lock.version = version;
    if (lock.packages?.['']) {
      lock.packages[''].version = version;
    }
    writeJson(packageLockPath, lock);
  }
}

function listArtifacts() {
  if (!existsSync(releaseDir)) return [];
  return readdirSync(releaseDir)
    .map((name) => join(releaseDir, name))
    .filter((path) => statSync(path).isFile())
    .filter((path) => /\.(deb|AppImage|rpm|tar\.gz|snap)$/i.test(path));
}

async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    usage();
    return;
  }

  const pkg = readJson(packageJsonPath);
  const version = argValue('--version') ?? pkg.version;
  validateVersion(version);

  const targets = (argValue('--targets') ?? 'deb,AppImage')
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean);

  console.log(`Packaging MobaNexterm v${version}`);
  console.log(`Linux targets: ${targets.join(', ')}`);

  syncVersion(version);
  mkdirSync(releaseDir, { recursive: true });

  if (!hasArg('--skip-checks')) {
    run('npm', ['run', 'typecheck']);
  }

  run('npm', ['run', 'build']);

  const builder = process.platform === 'win32'
    ? join(root, 'node_modules', '.bin', 'electron-builder.cmd')
    : join(root, 'node_modules', '.bin', 'electron-builder');

  if (!existsSync(builder)) {
    throw new Error('electron-builder binary not found. Run npm install first.');
  }

  // Packaging only creates local artifacts; release publication is an explicit separate step.
  run(builder, ['--linux', ...targets, '--publish', 'never']);

  const artifacts = listArtifacts();
  console.log('\nArtifacts:');
  for (const artifact of artifacts) {
    console.log(`  ${artifact}`);
  }
  if (artifacts.length === 0) {
    console.log('  No artifacts found in release/. Check electron-builder output above.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
