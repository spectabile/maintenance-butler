# Maintenance Butler

**Reclaim disk space by cleaning up old VS Code extension versions, cache files, and logs.**

VS Code accumulates gigabytes of stale data over time — outdated extension versions that were never removed, multiple layers of cache that rebuild automatically, and workspace storage for projects you deleted years ago. Maintenance Butler finds all of it, shows you the sizes, and lets you choose exactly what to clean.

> **Not yet on the Marketplace.** This extension is in active testing and has not been published yet.
> If you'd like to try it early, download the `.vsix` package from the [GitHub releases page](https://github.com/spectabile/maintenance-butler/releases) and install it manually:
> `Extensions` panel → `···` menu → **Install from VSIX…**

---

## Features

### Caches & Logs — auto-regenerated, safe to clean

Everything in this group is rebuilt automatically by VS Code. Deleting it is like clearing your browser cache — VS Code recreates it on next launch or on demand.

| Target | What it is | Default |
|--------|-----------|---------|
| Compiled Bytecode (CachedData) | Pre-compiled V8 bytecode for VS Code's own JS files. Rebuilt on next launch. | ✅ On |
| Code Cache | Chromium's bytecode cache for renderer processes. Rebuilt automatically. | ✅ On |
| HTTP Cache | Cached network responses (Marketplace requests, update checks). | ✅ On |
| WebStorage | Asset cache for extension webview panels (JS, CSS, images). | ✅ On |
| GPU Caches | Compiled GPU shader and pipeline data (GPUCache, DawnGraphiteCache, DawnWebGPUCache, VideoDecodeStats). Rebuilt at startup. | ✅ On |
| Crash Dumps (Crashpad) | Diagnostic crash reports. No impact on app functionality. | ✅ On |
| Logs | VS Code and extension host log files. Fresh logs created on next launch. | ✅ On |
| Old Extension Versions | Version folders left behind after updates. Keeps only the newest version. | ✅ On |
| Obsolete Extensions (.obsolete) | Extension folders VS Code has already marked for removal. Processes pending removals immediately. | ✅ On |
| Cached Extension VSIXs | Downloaded `.vsix` packages for faster reinstallation. VS Code re-downloads if needed. | Off |
| Network Cache | Chromium network state data. Minor re-initialization on next launch. | Off |
| Service Worker Cache | Registered service workers for webview extensions. Re-registered automatically on next webview open. | Off |

---

### ⚠️ Your History — permanently deleted, cannot be recovered

> **Warning:** The items below are **not** auto-regenerated. Once deleted, they are gone forever. A confirmation dialog is always shown before cleaning anything in this group.

| Target | What it is | Default |
|--------|-----------|---------|
| Orphaned Workspaces | Every workspace you open gets a storage folder containing open tabs, scroll positions, folded code sections, and extension state. This removes entries for project folders that **no longer exist on disk** — active workspaces are never touched. | Off |
| Existing/Active Workspaces | Opens a picker listing all workspace states for projects that still exist on disk. Choose exactly which ones to permanently delete. The currently open workspace is excluded automatically. | Off |
| Timeline History | VS Code's built-in per-file version history, visible in the Timeline panel. Lets you recover earlier versions of any file you've edited. Removes entries older than `historyMaxAgeDays` (default: 30 days). | Off |

**These can accumulate gigabytes over time** — especially on long-lived installations — but they represent real work history. Enable them only if you understand what will be deleted.

---

## Status Bar

After VS Code starts, Maintenance Butler scans your installation in the background and shows a bow-tie icon in the status bar:

| Display | Meaning |
|---------|---------|
| `⊠ 1.58 GB` | Total size queued for cleaning based on your current settings |
| `⊠ Clean` | Nothing is queued — all selected targets are already empty |

Clicking the status bar item opens the **Clean…** panel directly.

---

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and search for:

- **Maintenance Butler: Clean…** — scan all installations, select what to clean, and run. Shows sizes for each item. Items from "Your History" display a permanent-deletion warning before proceeding.
- **Maintenance Butler: Show Disk Usage** — scan without deleting. Opens a full disk usage report in a new panel tab, grouped by installation.

---

## Supported Installations

| Installation type | Detection |
|---|---|
| Standard (Windows) | `%APPDATA%\Code\` |
| Standard (macOS) | `~/Library/Application Support/Code/` |
| Standard (Linux) | `~/.config/Code/` |
| Portable | `VSCODE_PORTABLE` env var (set automatically by VS Code) |
| VS Code Insiders | Detected automatically via `vscode.env.appName` |

Maintenance Butler always cleans only the installation it is running in. To clean multiple installations, run the command from each one.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `maintenanceButler.cleanCachedData` | `true` | V8 bytecode cache |
| `maintenanceButler.cleanCodeCache` | `true` | Chromium bytecode cache |
| `maintenanceButler.cleanHttpCache` | `true` | Network request cache |
| `maintenanceButler.cleanWebStorage` | `true` | Webview asset cache |
| `maintenanceButler.cleanGPUCaches` | `true` | GPU shader and pipeline caches |
| `maintenanceButler.cleanCrashpad` | `true` | Crash dump files |
| `maintenanceButler.cleanLogs` | `true` | VS Code and extension host logs |
| `maintenanceButler.cleanDuplicateExtensions` | `true` | Old extension versions (keeps newest) |
| `maintenanceButler.cleanObsoleteExtensions` | `true` | Extensions marked for removal by VS Code |
| `maintenanceButler.cleanCachedExtensionVSIXs` | `false` | Cached downloaded extension packages |
| `maintenanceButler.cleanNetworkCache` | `false` | Network state cache |
| `maintenanceButler.cleanServiceWorkerCache` | `false` | Service worker registration cache |
| `maintenanceButler.cleanOrphanedWorkspaceStorage` | `false` | ⚠️ Workspace state for deleted projects (permanent) |
| `maintenanceButler.cleanWorkspaceStorage` | `false` | ⚠️ Workspace picker — choose which active workspace states to permanently delete |
| `maintenanceButler.cleanHistory` | `false` | ⚠️ Old Timeline History entries older than `historyMaxAgeDays` (permanent) |
| `maintenanceButler.historyMaxAgeDays` | `30` | Age threshold for Local History cleanup |
| `maintenanceButler.confirmPermanentDelete` | `true` | Show a confirmation dialog before permanently deleting any Your History items; set to `false` to skip confirmations |
| `maintenanceButler.showDescriptions` | `true` | Show description text under each item in the Clean panel |

---

## Requirements

- VS Code 1.74.0 or later

---

## Disclaimer

Maintenance Butler permanently deletes files from your file system. While every effort has been made to ensure that only safe, recoverable, or clearly labelled targets are cleaned, **you use this extension at your own risk**.

Spectabile accepts no responsibility for data loss, corrupted installations, or any other damage — direct or indirect — resulting from the use of this extension. Before enabling any target marked ⚠️, make sure you understand what will be deleted and that you have backups of anything you cannot afford to lose.

By using Maintenance Butler you confirm that you have read the documentation, understand what each cleaning target does, and take full responsibility for the actions you choose to perform.

---

## License

MIT — see [LICENSE](LICENSE)
