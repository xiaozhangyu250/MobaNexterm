# MobaNexterm

MobaNexterm is a Linux-first desktop client for managing SSH sessions, remote
terminals, and SFTP files in one application. It is built with Electron,
React, TypeScript, xterm.js, and ssh2.

The project is under active development. Back up important remote files before
using file operations in production environments.

## Features

- Saved SSH sessions with password or private-key authentication
- Multi-tab terminal sessions powered by xterm.js
- SFTP browsing, upload, download, rename, permissions, and file editing
- Encrypted credential storage through Electron `safeStorage` when available
- Dark and light themes, UI scaling, terminal font settings, and Chinese/English UI
- Linux packaging as AppImage and Debian packages

## Requirements

- Node.js 20 or newer
- npm
- Linux desktop environment for development and Linux packaging

## Development

```bash
git clone https://github.com/mobanexterm/mobanexterm.git
cd mobanexterm
npm ci
npm run dev
```

Available checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Linux Packaging

Build AppImage and Debian packages:

```bash
npm run package:linux -- --version 0.1.0
```

Artifacts are written to `release/`. You can select individual targets or skip
the type check when iterating locally:

```bash
npm run package:linux -- --version 0.1.0 --targets deb
npm run package:linux -- --targets deb,AppImage
npm run package:linux -- --skip-checks
```

## Project Layout

```text
src/
  main/       Electron main process, IPC handlers, SSH/SFTP services
  preload/    Typed context bridge exposed to the renderer
  renderer/   React user interface and client-side state
  shared/     Types and constants shared across processes
scripts/      Development and packaging helpers
tests/        Unit tests
```

## Filesystem Compatibility

This repository includes `.npmrc` and `scripts/setup-bin-shims.cjs` for
filesystems that do not support symbolic links, such as exFAT. On regular Linux
filesystems the workaround is harmless and no extra setup is required.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.
Security issues should be reported according to [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
