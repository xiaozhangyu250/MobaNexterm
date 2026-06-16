<p align="right">
  <a href="./README.md">简体中文</a> | <strong>English</strong>
</p>

# MobaNexterm

MobaNexterm is an open-source SSH terminal and SFTP file manager designed for Linux desktops. Inspired by MobaXterm's integrated workflow, it brings session management, remote terminals, and file transfers together in one lightweight, modern desktop application.

The project is built with Electron, React, TypeScript, xterm.js, and ssh2. It is currently under active development.

> [!WARNING]
> File operations directly modify the remote host. Before uploading, overwriting, renaming, changing permissions, or deleting files in production, verify the target path and back up important data.

## Preview

![MobaNexterm terminal and SSH file browser](doc/img/截图%202026-06-15%2020-33-00.png)

<details>
<summary>View more screenshots</summary>

### Terminal context menu

![Terminal copy and paste menu](doc/img/截图%202026-06-15%2020-33-37.png)

### SFTP file context menu

![SFTP file operations](doc/img/截图%202026-06-15%2020-33-56.png)

### Connection errors and quick reconnect

![SSH connection error](doc/img/截图%202026-06-15%2020-32-01.png)

</details>

## Features

### SSH sessions

- Create, edit, save, and delete SSH connections
- Password and local private-key authentication
- Passphrase-protected private keys
- Open a terminal by double-clicking a session or using its connect button
- Manage multiple remote terminals in tabs
- Press `R` to reconnect after a connection error or disconnect

### Remote terminal

- Interactive terminal powered by xterm.js with `xterm-256color` support
- Automatic terminal fitting and remote PTY resize synchronization
- 5,000-line scrollback buffer
- Clickable web links detected in terminal output
- Context-menu copy and paste with `Ctrl+Shift+C` / `Ctrl+Shift+V`
- Live connecting, connected, closed, and error indicators on each tab

### SFTP file management

- Browse remote directories in a tree or enter a path manually
- Follow the terminal's current working directory
- Upload and download individual files
- Recursively upload and download directories
- Drag files or directories from the local file manager to upload them
- Track transfer progress and task status
- Create directories, rename, delete, and change Unix permissions
- Copy a remote file or directory path
- Continue using the SSH terminal when the server does not provide SFTP

### Appearance and localization

- Dark and light themes
- English and Simplified Chinese interfaces
- UI scaling from `80%` to `125%`
- Terminal font sizes from `11px` to `20px`
- Locally persisted preferences

### Security and desktop integration

- Passwords and private-key passphrases are encrypted with Electron `safeStorage` when available
- Context isolation is enabled and Node.js integration is disabled in the renderer
- External links open in the system's default browser
- Single-instance operation prevents concurrent processes from modifying session data

> [!NOTE]
> If Electron `safeStorage` encryption is unavailable in the current desktop environment, the application falls back to local plaintext storage. Use a desktop environment with a configured system keyring and protect your user configuration directory.

## Quick Install

### Requirements

- A Linux desktop environment
- Network access to the target server
- SSH enabled on the target server; the SFTP subsystem is also required for file management

Download the package matching your system architecture from the project's [Releases](https://github.com/mobanexterm/mobanexterm/releases) page.

### Debian / Ubuntu

After downloading the `.deb` package, run this command from its directory:

```bash
sudo apt install ./MobaNexterm-VERSION-ARCH.deb
```

Launch MobaNexterm from the application menu or from a terminal:

```bash
/opt/MobaNexterm/mobanexterm
```

Uninstall it with:

```bash
sudo apt remove mobanexterm
```

### AppImage

After downloading the `.AppImage` file:

```bash
chmod +x MobaNexterm-VERSION-ARCH.AppImage
./MobaNexterm-VERSION-ARCH.AppImage
```

AppImage requires no installation and can run from any directory with execute permission.

## Quick Start

### 1. Create an SSH session

1. Start MobaNexterm.
2. Click `+` in the upper-right corner of the Sessions panel, or click the Quick Connect area.
3. Enter a session name, host, port, and username.
4. Select password or private-key authentication. For a private key, enter its absolute local path.
5. Click Create to save the session.

### 2. Connect to a remote host

Double-click a saved session, or hover over it and click the connect button. Each connection opens in an independent terminal tab, so you can work with multiple hosts at the same time.

If the connection fails or the remote shell closes, press `R` in the current terminal to reconnect.

### 3. Use the terminal

| Action | Shortcut or control |
| --- | --- |
| Copy selected text | `Ctrl+Shift+C` or the terminal context menu |
| Paste clipboard text | `Ctrl+Shift+V` or the terminal context menu |
| Reconnect | Press `R` after an error or disconnect |
| Open a link | Click a detected URL in the terminal |
| Close a session | Click the close button on its tab |

### 4. Manage remote files

After connecting, open SSH Browser in the left sidebar:

- Use the toolbar to upload, download, create directories, rename, or delete.
- Drop local files or directories into the file list to upload them to the current directory, or drop them directly onto a remote directory.
- Right-click a remote item to download it, change permissions, copy its path, rename it, or delete it.
- Enable the location button to make the file browser follow the terminal's current working directory when possible.
- Check transfer progress and results at the bottom of the panel.

## Run from Source

### Development requirements

- Node.js 20 or newer
- npm
- A Linux desktop environment

```bash
git clone https://github.com/mobanexterm/mobanexterm.git
cd mobanexterm
npm ci
npm run dev
```

Build and preview the production version:

```bash
npm run build
npm run preview
```

## Build Linux Packages

Build both the Debian package and AppImage:

```bash
npm run package:linux -- --version 0.1.0
```

Artifacts are written to `release/`. You can also build a single target:

```bash
npm run package:linux -- --version 0.1.0 --targets deb
npm run package:linux -- --version 0.1.0 --targets AppImage
```

Skip the pre-package type check during local iteration:

```bash
npm run package:linux -- --skip-checks
```

## Development Checks

Run these checks before submitting code:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Tech Stack

- Electron
- React 18
- TypeScript
- xterm.js
- ssh2
- Zustand
- Tailwind CSS
- Radix UI
- electron-builder

## Project Structure

```text
src/
  main/       Electron main process, IPC, SSH/SFTP services, and credential storage
  preload/    Typed APIs exposed to the renderer
  renderer/   React UI, state management, and terminal components
  shared/     Types and constants shared across processes
scripts/      Development, dependency setup, and Linux packaging scripts
tests/        Unit tests
doc/img/      Documentation screenshots
```

## Filesystem Compatibility

The repository includes `.npmrc` and `scripts/setup-bin-shims.cjs` for filesystems that do not support symbolic links, such as exFAT. No additional setup is required on regular Linux filesystems.

## Current Scope

The current release focuses on SSH terminal and SFTP workflows on Linux. Windows/macOS packages, session groups, graphical SSH Agent configuration, jump hosts, port forwarding, and a remote file editor are not yet provided as stable features.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting development.

Do not post passwords, private keys, real host details, or other sensitive data in public issues. Report security issues privately by following [SECURITY.md](SECURITY.md).

## License

MobaNexterm is open source under the [MIT License](LICENSE).
