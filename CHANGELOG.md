# Changelog

All notable changes to Maintenance Butler will be documented here.

## [Unreleased]

## [1.6.7] — 2026-06-10

### Fixed
- `getDirSize` returned wrong size for any directory containing subdirectories — a JavaScript pre-await read race caused the directory subtotal to overwrite accumulated file sizes when running inside `Promise.all`; fixed by collecting sizes into an array and summing with `reduce`

## [1.6.6] — 2026-06-10

### Changed
- Key phrases in item descriptions now rendered in bold: `historyMaxAgeDays`, `no longer exist on disk`, `still exist on disk`
- Orphaned Workspaces and Active Workspaces descriptions harmonised — fully symmetric wording, differing only on the bolded disk-existence phrase

## [1.6.5] — 2026-06-10

### Changed
- **Disk Usage Report now opens in a WebviewPanel tab** — same visual style as the Clean panel, grouped by installation, with size and item count per target; the VS Code Output channel is no longer used

## [1.6.4] — 2026-06-10

### Fixed
- Workspace-picker size badge showed full size instead of `0 B` when the parent item was unchecked on initial render

## [1.6.3] — 2026-06-10

### Fixed
- Select All badge was missing the `/ total` portion — now always shows `X / Y` format regardless of how the toggle was triggered

## [1.6.2] — 2026-06-10

### Added
- Checkbox state is now remembered across "Scan Again" — items that were manually checked or unchecked stay that way after a rescan; state resets only when the tab is closed

## [1.6.1] — 2026-06-10

### Changed
- Permanent-deletion warning dialog is no longer shown for Orphaned Workspaces (those folders no longer exist on disk); dialog is retained for Active Workspaces

## [1.6.0] — 2026-06-10

### Changed
- **Clean panel stays open at all times** — clicking "Clean" no longer closes the tab; the panel remains visible throughout the operation
- Cleaning progress and results are now shown inside the panel tab instead of the VS Code Output channel
- After cleaning: result view displays bytes freed and any errors (capped at 5), with "Scan Again" and "Close" buttons
- "Scan Again" rescans all installations and reopens the panel with updated sizes

## [1.5.6] — 2026-06-10

### Fixed
- Permanent-deletion warning dialog showed a duplicate Cancel button and a duplicate ⚠️ icon — only the large orange icon is now shown

## [1.5.1–1.5.5] — 2026-06-10

### Changed
- CSS updates to improve overall readability and visual polish

## [1.5.0] — 2026-06-09

### Changed
- Header and footer now correctly centered in a 900px column (`max-width: 900px; margin: 0 auto` on the zones themselves — the approach that actually works in VS Code webviews)
- Header title and subtitle centered and enlarged (title 1.2em, subtitle 1em)
- Content list rendered inside a rounded card (border-radius 0.8rem, dark teal background `#1c2c35`)
- Section labels: vertical padding increased to 16px for better breathing room
- Footer buttons centered with 22px vertical padding

## [1.4.9] — 2026-06-09

### Changed
- Header/footer centering: switched to `display: flex; justify-content: center` on outer zones

## [1.4.8] — 2026-06-09

### Changed
- Added `width: 100%` to body to establish defined cross-axis width for flex children in webview context

## [1.4.7] — 2026-06-09

### Changed
- Content items rendered inside a `content-inner` div; `.content` uses `display: flex; flex-direction: column; align-items: center` for centering

## [1.4.6] — 2026-06-09

### Changed
- Size badges: removed pill background/border-radius, font size increased to 0.92em, color changed to foreground (white on dark themes)
- Header and footer content wrapped in centered inner divs (`max-width: 900px`) — first centering attempt
- Footer vertical padding increased

## [1.4.5] — 2026-06-09

### Changed
- Section labels ("Caches & Logs" / "Your History") now have a solid bottom border — clear visual separator before their items
- Workspace accordion entries (orphaned/active workspace rows) now separated by subtle dashed borders
- Removed dashed border from main item rows (was incorrectly placed there in 1.4.4)

## [1.4.4] — 2026-06-09

### Changed
- "YOUR HISTORY" section now has extra top margin — clear visual breathing room from Caches & Logs
- Content area constrained to max-width 900px so size badges sit close to item labels instead of floating at the far edge
- Item rows taller (7px padding) and separated by a subtle dashed border for easier row-scanning

## [1.4.3] — 2026-06-09

### Changed
- "Orphaned Workspace Storage" renamed to "Orphaned Workspaces" — now shows its own accordion with only orphaned entries, all pre-checked by default
- "Existing Workspace Storage" renamed to "Existing/Active Workspaces" — accordion shows only active entries, nothing pre-checked by default
- Both workspace pickers have a "Select All" checkbox, no sub-sections inside each accordion
- "YOUR HISTORY" section label color changed to vivid red (#ff4040) for better readability
- Orphaned workspace path color changed to bright amber (#ffa726) instead of muted mustard

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
