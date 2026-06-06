# Changelog

All notable changes to VS Code Janitor will be documented here.

## [Unreleased]

## [0.1.0] — 2026-06-06

### Added
- Initial release
- Command: **VS Code Janitor: Clean…** — multi-select QuickPick with size preview, risk labels, and dry-run support
- Command: **VS Code Janitor: Show Disk Usage** — full disk usage report in the Output panel
- Zero-risk targets (enabled by default): CachedData, Code Cache, HTTP Cache, WebStorage, GPU Caches, Crashpad, Logs, Duplicate Extension Versions, Obsolete Extensions
- Low-risk targets (opt-in, with warning): Cached Extension VSIXs, Network Cache, Service Worker Cache, Orphaned Workspace Storage, Local History (age-based)
- Full OS support: Windows, macOS, Linux
- Portable VS Code support via `VSCODE_PORTABLE` env var or manual path setting
- VS Code Insiders support (opt-in)
- 17 configurable settings
