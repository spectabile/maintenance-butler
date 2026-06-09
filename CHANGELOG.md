# Changelog

All notable changes to Maintenance Butler will be documented here.

## [Unreleased]

## [1.4.2] — 2026-06-09

### Changed
- "⚠️ Your History" section label now uses error-red color — much more readable than the previous muted yellow
- Section header font size increased to be visibly larger than item text
- "Local History (Timeline)" renamed to "Timeline History"
- "Workspace Storage…" renamed to "Existing Workspace Storage…" with a clearer detail: explicitly states these are workspaces whose project folders still exist on disk

## [1.4.1] — 2026-06-09

### Fixed
- "Clean Orphaned Workspace Storage" and "Clean Timeline History" no longer disappear from the panel when the scan finds nothing on disk — they now appear (with 0 B badge) whenever enabled in Settings

## [1.4.0] — 2026-06-09

### Changed
- **Clean picker replaced with a WebviewPanel UI** — opens as a proper editor tab instead of the cramped QuickPick dropdown
- Each item row shows a checkbox, name, detail, and live size badge
- Two clear sections: "Caches & Logs" and "⚠️ Your History — permanently deleted, cannot be recovered"
- Workspace Storage picker is now an inline accordion inside the panel — expands when the row is checked, orphaned entries pre-checked, Select All toggle with indeterminate state
- Footer button reads "Clean N items · Y MB" and updates live as items are checked/unchecked
- Permanent deletion warning modal fires after the panel closes (same disruptive UX as before)

## [1.3.2] — 2026-06-08

### Added
- Group separators in the Clean picker — "Caches & Logs" and "Your History" sections now clearly labelled
- Workspace Storage picker — choose exactly which workspace states to permanently delete, with Select All toggle, orphaned entries pre-checked, and currently open workspace excluded

## [1.3.1] — 2026-06-08

### Added
- Disclaimer section in README — clarifies user responsibility for permanent deletions

## [1.3.0] — 2026-06-08

### Added
- Extension icon for the VS Code Marketplace

### Changed
- **Renamed from VS Code Janitor to Maintenance Butler** — new extension ID (`spectabile.maintenance-butler`), command IDs (`maintenanceButler.*`), and configuration keys (`maintenanceButler.*`)
- **Smart install detection** — the extension now automatically detects and cleans only the VS Code install it is currently running in (portable via `VSCODE_PORTABLE`, Insiders via `vscode.env.appName`); no manual configuration needed
- Removed `portableDataPath` setting — no longer needed with automatic detection
- Removed `includeInsiders` setting — no longer needed with automatic detection

### Fixed
- `.obsolete` extension item count was inflated by 1 when orphaned entries were found

## [1.0.0] — 2026-06-06

### Added
- Initial release
- Command: **Maintenance Butler: Clean…** — multi-select QuickPick with size preview, risk labels, and dry-run support
- Command: **Maintenance Butler: Show Disk Usage** — full disk usage report in the Output panel
- Zero-risk targets (enabled by default): CachedData, Code Cache, HTTP Cache, WebStorage, GPU Caches, Crashpad, Logs, Duplicate Extension Versions, Obsolete Extensions
- Low-risk targets (opt-in, with warning): Cached Extension VSIXs, Network Cache, Service Worker Cache, Orphaned Workspace Storage, Local History (age-based)
- Full OS support: Windows, macOS, Linux
- Portable VS Code support via `VSCODE_PORTABLE` env var
- 17 configurable settings
