#!/usr/bin/env node
/* eslint-disable */
// Workaround for exfat: --no-bin-links skips .bin/ symlinks.
// Recreate them as regular file shims that exec the real binary via node.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'node_modules', '.bin');
const NODE_MODULES = path.join(ROOT, 'node_modules');

fs.mkdirSync(BIN_DIR, { recursive: true });

function findBinTargets() {
  const targets = {};
  function walk(dir, depth = 0) {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.')) continue;
      const sub = path.join(dir, e.name);
      const pkgJson = path.join(sub, 'package.json');
      if (fs.existsSync(pkgJson)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
          if (pkg.bin) {
            const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : pkg.bin;
            for (const [name, rel] of Object.entries(bins)) {
              const cleanName = name.replace(/^@[^/]+\//, '');
              if (!targets[cleanName]) {
                targets[cleanName] = path.join(sub, rel);
              }
            }
          }
        } catch {
          // ignore broken package.json
        }
      }
      if (e.name.startsWith('@')) {
        walk(sub, depth + 1);
      }
    }
  }
  walk(NODE_MODULES);
  return targets;
}

const targets = findBinTargets();
let created = 0;
for (const [name, target] of Object.entries(targets)) {
  if (!fs.existsSync(target)) continue;
  const shimPath = path.join(BIN_DIR, name);
  const relTarget = path.relative(BIN_DIR, target);
  const shim = `#!/bin/sh\nexec node "$(dirname "$0")/${relTarget}" "$@"\n`;
  fs.writeFileSync(shimPath, shim, { mode: 0o755 });
  created++;
}

console.log(`Created ${created} bin shims in node_modules/.bin/`);
