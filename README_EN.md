<p align="right">
  <a href="./README.md">简体中文</a> | <strong>English</strong>
</p>

# MobaNexterm

**An SSH debugging workspace for Linux: terminals, remote files, performance summaries, and shareable commands.**

Inspired by MobaXterm's integrated workflow, MobaNexterm brings everyday SSH tasks into one desktop application. Connect to a development board, inspect robot logs, edit remote configuration, and save the commands you use repeatedly—all from the same workspace.

Built with Electron, React, TypeScript, xterm.js, and ssh2. MIT licensed and under active development.

[Quick start](#quick-start) · [Highlights](#highlights) · [Installation](#installation) · [Development and testing](#development-and-testing) · [Roadmap](doc/engineering/PLAN.md)

![SSH terminal, directory-following file browser, and remote performance summary](doc/img/readme-workspace.png)

> Screenshots show the actual application in Chinese, using an isolated local SSH/SFTP demo server. Hosts, files, logs, and metric values are examples, not real device data. Robot and ROS commands illustrate user-defined workflows; they are not built-in ROS diagnostics. English is also available in Settings.

## Highlights

| Everyday task | What MobaNexterm provides |
| --- | --- |
| Work with several devices | Saved SSH sessions, name/host/user filtering, terminal tabs, password or private-key authentication |
| Inspect files while running commands | SFTP follows the terminal directory; the current and expanded directories refresh about every 3 seconds |
| Check device load | CPU, memory, and root filesystem usage in the status bar, normally sampled every 5 seconds |
| Avoid repetitive typing | Custom working directories and multiline commands, available globally or for one saved host |
| Share debugging workflows | Selective JSON export/import, script previews, and explicit mapping to local hosts |
| Edit remote configuration | Independent editor windows, basic highlighting, find/replace, and save conflict checks |
| Review output after a disconnect | Inline reconnect notices, readable/searchable scrollback, and `R` to reconnect |

### Keep the terminal and file browser together

Change directories in the terminal and the SSH Browser can follow. Files created or removed by terminal commands or other programs appear through automatic refresh. Pause directory following whenever you want to browse independently.

- Upload and download files or directories, including drag-and-drop uploads from your local file manager.
- Create directories, rename, delete, change permissions, copy paths, and download archives.
- Bash/Zsh directory integration is enabled by default; saved opt-outs are respected. Reconnect after changing the setting. Native server-side OSC 7 directory reports also work.
- Shell and SFTP availability are handled separately, so SFTP failure does not close the terminal.

The terminal includes ANSI colors, Unicode 11 character widths, 5,000 lines of scrollback, clickable links, and `Ctrl+Shift+F` search. Window dimensions are synchronized with the remote PTY, and output flow control handles sustained streams.

### Turn routine operations into quick commands

The **Commands** sidebar filters buttons by the active SSH session. Share resource checks across all hosts, or limit device-specific launch scripts and log commands to one saved session.

![Quick commands with global and host-specific scopes](doc/img/readme-shortcuts.png)

Each command has a name, working directory, multiline script, and scope. Leave the directory empty to use the terminal's current directory, or specify an absolute path, `~`, or `~/…`. If changing directories fails, the script is not executed.

The command editor opens in an **independent, non-modal window**, so you can continue using the terminal and copying text while editing. It includes Shell highlighting, field validation, optional Bash syntax checking, `Ctrl+S`, and an unsaved-changes prompt.

![Independent command editor with directory, scope, multiline script, and syntax checking](doc/img/readme-command-editor.png)

Commands run in the current terminal's Shell environment. Use them at an empty shell prompt. Execution is disabled after disconnect and blocked in alternate-screen applications such as Vim. Bash syntax checking does not execute scripts or validate remote tools and paths.

### Select, preview, and share command configurations

Export a useful collection of debugging commands. Other users can import just the entries they need and bind them to their own devices.

- **Export:** select all or individual entries from every saved command, preview directories and scripts, and save a JSON file.
- **Import:** preview and select entries, then explicitly map host-specific commands to a local SSH session or make them global. Bulk scope assignment is supported.
- **Name conflicts:** imports create new local records. Conflicting names receive numbered suffixes such as `Name (2)`; existing commands are not overwritten.
- **Validation:** format, version, fields, and target hosts are checked before saving the batch. Failure or cancellation does not partially import data. Importing never runs scripts.

![Selective import with script preview and local host mapping](doc/img/readme-command-import.png)

<details>
<summary>See selective command export</summary>

![Select and preview the commands to export](doc/img/readme-command-export.png)

</details>

Files support up to 500 commands and 2 MiB. SSH credentials, session IDs, and connection settings are excluded. Script text and host display names are retained, including anything users put inside a command. See the [format and implementation notes](doc/engineering/PERFORMANCE_AND_SHORTCUTS.md#快捷指令导入与导出).

### Edit remote files in independent windows

Double-click an editable text file to open it separately, keeping the terminal available without a manual download/edit/upload cycle.

- Basic syntax highlighting, cursor position, search, case matching, replace, and replace all.
- `Ctrl+F` to find, `Ctrl+H` to replace, `Ctrl+S` to save, and unsaved-change protection on close.
- Save-time checks for external changes, followed by a temporary-file write and replacement using the OpenSSH atomic-rename extension.
- Local drafts remain available after a failed save. Unsupported safe-save capabilities are reported explicitly.

![Independent remote text editor with YAML highlighting and find/replace](doc/img/readme-file-editor.png)

Text editing is limited to supported files up to 2 MiB; binary files and invalid UTF-8 are rejected. See [validation notes](doc/engineering/VALIDATION.md) for the complete save boundaries.

### A focused desktop workspace

Performance sampling uses a separate SSH channel and does not insert monitoring commands into the interactive terminal. Hover over memory or disk usage to see used/total values. Missing or failed samples are marked unavailable instead of presenting stale data as current.

The UI includes dark/light themes, English/Chinese localization, a resizable sidebar, 80%–125% UI scaling, and 11–20 px terminal fonts. Independent editors open on the main window's display; window placement also handles off-screen positions and display layout changes.

<details>
<summary>See disconnect behavior: keep the context and press R to reconnect</summary>

Disconnect notices are appended to the terminal in red with separators. Previous output remains available, and reconnecting preserves scrollback.

![Inline disconnect notice preserves terminal history](doc/img/readme-reconnect.png)

</details>

## Quick Start

1. Click `+` in **Sessions**, or press `Ctrl+Shift+K`, and enter the host, port, username, and authentication details.
2. Double-click the saved session to open a terminal. Use **SSH Browser** to inspect and transfer files.
3. Open **Commands**, click `+`, enter a directory and script, choose global or host-specific scope, and save.
4. Click a command button at an empty shell prompt. Use **Export commands** to share a collection and **Import commands** to load one.

For example, save the following as a host-specific command with your workspace as its working directory. Adjust the ROS version and paths to the actual remote environment:

```bash
source /opt/ros/humble/setup.bash
source install/setup.bash
ros2 topic list
ros2 topic info /scan
```

| Action | Shortcut |
| --- | --- |
| New SSH session | `Ctrl+Shift+K` |
| Switch terminal tabs | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Search terminal output | `Ctrl+Shift+F` |
| Copy / paste in terminal | `Ctrl+Shift+C` / `Ctrl+Shift+V` |
| Find / replace in remote file editor | `Ctrl+F` / `Ctrl+H` |
| Save in an editor | `Ctrl+S` |
| Fullscreen | `F11` |
| Reconnect after disconnect | Press `R` in the terminal |

## Installation

Requires a Linux desktop and an accessible SSH server. File management requires SFTP. Performance sampling targets Linux hosts that provide `/proc` and `df`.

Check [Releases](https://github.com/xiaozhangyu250/MobaNexterm/releases) for packages. If a suitable prebuilt package is not available, run from source.

**Debian / Ubuntu**

Replace the filename with your downloaded version and architecture:

```bash
sudo apt install ./MobaNexterm-VERSION-ARCH.deb
```

Launch from the application menu or run `/opt/MobaNexterm/mobanexterm`. Uninstall with `sudo apt remove mobanexterm`.

**AppImage**

```bash
chmod +x MobaNexterm-VERSION-ARCH.AppImage
./MobaNexterm-VERSION-ARCH.AppImage
```

### Run from source

Requires Node.js 20 or newer, npm, and a Linux desktop environment.

```bash
git clone https://github.com/xiaozhangyu250/MobaNexterm.git
cd MobaNexterm
npm ci
npm run dev
```

Build and preview the production version:

```bash
npm run build
npm run preview
```

### Build Linux packages

```bash
npm run package:linux                         # deb + AppImage, using package.json version
npm run package:linux -- --targets deb         # deb only
npm run package:linux -- --targets AppImage    # AppImage only
```

Artifacts go to `release/`. Use `--version X.Y.Z` to update the version before packaging; this also modifies `package.json` and the lockfile. The repository includes support for filesystems without symlinks, such as exFAT; see `.npmrc` and `scripts/setup-bin-shims.cjs`.

## Development and Testing

```bash
npm run check             # Types, lint, unit/service regressions, production build
npm run test:electron     # Electron + isolated SSH/SFTP workflow regressions
# Linux CI without a desktop display
xvfb-run -a npm run test:electron
```

Coverage includes terminal protocols and connection lifecycle, file refresh, text saving, window geometry, performance sampling, command execution, and configuration import/export. Desktop tests use temporary profiles and local demo services, not users' saved hosts. CI runs the checks and retains screenshots. See [validation notes](doc/engineering/VALIDATION.md) for distribution and physical-display testing boundaries.

Recreate the screenshots in this README:

```bash
npm run docs:screenshots
# Without a display: xvfb-run -a npm run docs:screenshots
```

This builds the current code and prepares demo scenarios in the actual Electron UI, updating `doc/img/readme-*.png`. No robot or personal session data is needed.

```text
src/
  main/         Electron main process, IPC, SSH/SFTP, command storage, metrics
  preload/      Typed cross-process APIs
  renderer/     React UI, state, terminals, and independent editor windows
  shared/       Shared types, validation, and configuration exchange format
scripts/        Development, packaging, and README screenshot scripts
tests/unit/     Unit and service regressions
tests/electron/ Desktop workflows and SSH/SFTP fixtures
doc/engineering/ Design notes, roadmap, and validation boundaries
doc/img/        Documentation screenshots
```

Stack: Electron · React 18 · TypeScript · xterm.js · ssh2 · Zustand · Tailwind CSS · Radix UI · electron-builder.

## Compatibility and Known Limits

- **Directory following:** requires Bash/Zsh integration or remote OSC 7 reports. File refresh uses polling, not server-side filesystem events.
- **Performance summary:** reports the root filesystem rather than all disks combined. Restricted SSH exec, missing tools, or insufficient permissions may leave some metrics unavailable.
- **Quick commands:** the execution wrapper targets Bash/Zsh/POSIX-compatible shells; fish is unverified. Not every normal-screen interactive program can be detected, so return to an empty shell prompt before running a command.
- **Text saving:** requires OpenSSH `posix-rename`. Replacement does not preserve extended ACLs, xattrs, or hard-link relationships, and does not provide an atomic cross-process conflict lock.
- **Credentials and trust:** Electron `safeStorage` is used when available, with a local plaintext fallback otherwise. SSH host-key fingerprint trust management still needs work; see [validation and limitations](doc/engineering/VALIDATION.md).
- **Not implemented yet:** Windows/macOS packages, session groups, graphical SSH Agent configuration, jump hosts, port forwarding, and split terminals.

See [PLAN.md](doc/engineering/PLAN.md) for the roadmap. Feedback based on real debugging workflows is welcome.

## Contributing

[Issues](https://github.com/xiaozhangyu250/MobaNexterm/issues) and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions and [SECURITY.md](SECURITY.md) for private security reports. Include the version, system environment, and reproduction steps; remove passwords, private keys, and real device details.

## License

[MIT License](LICENSE)
