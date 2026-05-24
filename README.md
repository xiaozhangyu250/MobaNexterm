# MobaNexterm

A cross-platform, modern MobaXterm-like remote management tool for Linux and Windows.

> Status: **W1 skeleton** — main window + IPC scaffolding only. SSH/SFTP coming in W3–W5.

## Tech Stack

- Electron 33 + React 18 + TypeScript 5 (strict)
- electron-vite + Vite 5 (HMR for main / preload / renderer)
- Tailwind CSS 3 + shadcn/ui (Radix primitives) + lucide-react
- Zustand for state
- xterm.js 5 for terminal rendering
- ssh2 / node-pty for transport
- electron-store + Electron safeStorage for persistence + credential encryption
- electron-builder for AppImage / .deb / .exe / .dmg

## Quickstart

```bash
npm install         # installs with --no-bin-links (project lives on exfat — see Filesystem note)
npm run dev         # launches Electron with HMR
```

Expected on first launch: a 1280×800 window with a frosted titlebar, an empty
sessions sidebar, and a status bar showing "IPC pong" — confirming the
preload bridge is working end-to-end.

## Filesystem note

This repo currently lives on an **exfat** mount, which does NOT support
symbolic links. The Node toolchain (npm/pnpm) normally creates symlinks in
`node_modules/.bin/`. Workarounds wired into the repo:

- `.npmrc` sets `bin-links=false`
- `scripts/setup-bin-shims.cjs` runs as part of `postinstall` and creates
  real-file shim scripts in `node_modules/.bin/` that `exec node ...` the real
  binary. This works without any symlinks.

Once moved to an ext4/btrfs/NTFS filesystem, you can delete `.npmrc` and the
shim script, and use plain `pnpm install` / `pnpm dev`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Run with HMR |
| `pnpm build` | Compile main / preload / renderer |
| `pnpm typecheck` | Strict TS check across both project refs |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright Electron E2E |
| `pnpm dist:linux` | Build AppImage + .deb |
| `pnpm dist:win` | Build NSIS installer |
| `pnpm dist:mac` | Build .dmg |
| `pnpm rebuild` | Rebuild ssh2 / node-pty against Electron ABI |

## Project Layout

```
src/
├── main/         Electron main process — IPC handlers, ssh2 connection pool, SFTP, tunnels
├── preload/      contextBridge — exposes typed window.api / window.events
├── renderer/     React UI — sidebar, terminal tabs, SFTP panel, settings
└── shared/       Types & constants shared across processes
```

## Roadmap

See [plan file](https://example.invalid) for the full 8-week roadmap. Short version:

- **W1** ✅ skeleton + IPC
- **W2** session CRUD + persistence
- **W3** SSH single-tab terminal (ssh2 + xterm.js)
- **W4** multi-tab + terminal polish
- **W5** SFTP browser + transfers
- **W6** SSH tunnels + credential encryption (safeStorage)
- **W7** settings + i18n + themes
- **W8** packaging + CI + release

## License

MIT
