# Changelog

All notable changes to Maintenance Butler will be documented here.

## [Unreleased]

## [0.3.0] — 2026-06-08

### Added
- Extension icon for the VS Code Marketplace

### Changed
- **Renamed from VS Code Janitor to Maintenance Butler** — new extension ID (`spectabile.maintenance-butler`), command IDs (`maintenanceButler.*`), and configuration keys (`maintenanceButler.*`)
- **Smart install detection** — the extension now automatically detects and cleans only the VS Code install it is currently running in (portable via `VSCODE_PORTABLE`, Insiders via `vscode.env.appName`); no manual configuration needed
- Removed `portableDataPath` setting — no longer needed with automatic detection
- Removed `includeInsiders` setting — no longer needed with automatic detection

### Fixed
- `.obsolete` extension item count was inflated by 1 when orphaned entries were found

## [0.1.0] — 2026-06-06

### Added
- Initial release
- Command: **Maintenance Butler: Clean…** — multi-select QuickPick with size preview, risk labels, and dry-run support
- Command: **Maintenance Butler: Show Disk Usage** — full disk usage report in the Output panel
- Zero-risk targets (enabled by default): CachedData, Code Cache, HTTP Cache, WebStorage, GPU Caches, Crashpad, Logs, Duplicate Extension Versions, Obsolete Extensions
- Low-risk targets (opt-in, with warning): Cached Extension VSIXs, Network Cache, Service Worker Cache, Orphaned Workspace Storage, Local History (age-based)
- Full OS support: Windows, macOS, Linux
- Portable VS Code support via `VSCODE_PORTABLE` env var or manual path setting
- VS Code Insiders support (opt-in)
- 17 configurable settings
