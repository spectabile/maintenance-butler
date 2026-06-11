import * as vscode from 'vscode';
import { ScanResult, VSCodeInstall } from './types';

export interface CleanSelection {
  selected: ScanResult[];
  workspaceStorageMap?: Record<string, string[]>;
}

interface SerializedItem {
  key: string;
  label: string;
  detail: string;
  sizeBytes: number;
  itemCount: number;
  risk: 'safe' | 'permanent';
  defaultChecked: boolean;
  isWorkspacePicker: boolean;
  workspaceEntries?: {
    storagePath: string;
    projectPath: string;
    isOrphaned: boolean;
    sizeBytes: number;
  }[];
}

export interface RememberedState {
  checked: string[];
  wsChecked: Record<string, string[]>;
}

export interface CleanPanelHandlers {
  onClean(selection: CleanSelection, panel: vscode.WebviewPanel): Promise<void>;
  onRescan(panel: vscode.WebviewPanel, rememberedState?: RememberedState): Promise<void>;
}

export async function showCleanPanel(
  results: ScanResult[],
  config: vscode.WorkspaceConfiguration,
  multiInstall: boolean,
  handlers: CleanPanelHandlers
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'maintenanceButlerClean',
    'Maintenance Butler — Clean',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = buildCleanPanelHtml(results, config, multiInstall);

  return new Promise<void>(resolve => {
    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'clean') {
        const keySet = new Set<string>(msg.selected as string[]);
        const selected = results.filter(r => keySet.has(`${r.target.id}:${r.install.name}`));
        await handlers.onClean({ selected, workspaceStorageMap: msg.workspaceStorageMap }, panel);
      } else if (msg.type === 'cancel' || msg.type === 'close') {
        panel.dispose();
      } else if (msg.type === 'rescan') {
        const remembered: RememberedState | undefined = msg.rememberedChecked
          ? { checked: msg.rememberedChecked as string[], wsChecked: (msg.rememberedWsChecked ?? {}) as Record<string, string[]> }
          : undefined;
        await handlers.onRescan(panel, remembered);
      }
    });
    panel.onDidDispose(() => resolve());
  });
}

export function buildCleanPanelHtml(
  results: ScanResult[],
  config: vscode.WorkspaceConfiguration,
  multiInstall: boolean,
  rememberedState?: RememberedState
): string {
  const totalBytes = results.reduce((sum, r) => sum + r.sizeBytes, 0);
  const nonce = generateNonce();
  const rememberedSet = rememberedState ? new Set(rememberedState.checked) : null;
  const serialized: SerializedItem[] = results.map(r => {
    const isEnabled: boolean = config.get(r.target.configKey, r.target.defaultEnabled);
    const installPrefix = multiInstall ? `[${r.install.name}] ` : '';
    const key = `${r.target.id}:${r.install.name}`;
    const item: SerializedItem = {
      key,
      label: `${installPrefix}${r.target.label}`,
      detail: r.target.detail,
      sizeBytes: r.sizeBytes,
      itemCount: r.itemCount,
      risk: r.target.risk,
      defaultChecked: rememberedSet ? rememberedSet.has(key) : isEnabled,
      isWorkspacePicker: r.workspaceEntries !== undefined,
    };
    if (item.isWorkspacePicker && r.workspaceEntries) {
      item.workspaceEntries = r.workspaceEntries.map(e => ({
        storagePath: e.storagePath,
        projectPath: e.projectPath,
        isOrphaned: e.isOrphaned,
        sizeBytes: e.sizeBytes,
      }));
    }
    return item;
  });
  const showDescriptions: boolean = config.get('showDescriptions', true);
  return buildHtml(serialized, totalBytes, nonce, rememberedState?.wsChecked, showDescriptions);
}

// ── Disk Usage Panel ──────────────────────────────────────────────────────

export function showDiskUsagePanel(results: ScanResult[], installs: VSCodeInstall[]): void {
  const panel = vscode.window.createWebviewPanel(
    'maintenanceButlerDiskUsage',
    'Maintenance Butler — Disk Usage',
    vscode.ViewColumn.One,
    { enableScripts: false }
  );
  panel.webview.html = buildDiskUsageHtml(results, installs);
}

function buildDiskUsageHtml(results: ScanResult[], installs: VSCodeInstall[]): string {
  let grandTotal = 0;
  const sections: string[] = [];

  for (const install of installs) {
    const installResults = results.filter(r => r.install.name === install.name && r.sizeBytes > 0);
    if (installResults.length === 0) continue;

    let installTotal = 0;
    const rows: string[] = [];

    for (const r of installResults) {
      installTotal += r.sizeBytes;
      const isPermanent = r.target.risk === 'permanent';
      const itemsHtml = r.itemCount > 1 ? `<span class="item-count">${r.itemCount} items</span>` : '';
      const riskHtml = isPermanent ? `<span class="risk-tag">⚠ permanent</span>` : '';
      rows.push(`<div class="item-row${isPermanent ? ' permanent' : ''}">
  <div class="item-meta"><span class="item-name">${esc(r.target.label)}</span>${riskHtml}</div>
  <div class="item-right">${esc(fmtBytes(r.sizeBytes))}${itemsHtml ? ' ' + itemsHtml : ''}</div>
</div>`);
    }

    grandTotal += installTotal;
    sections.push(`<div class="install-block">
  <div class="install-header">
    <span class="install-name">[${esc(install.name)}]</span>
    <span class="install-path">${esc(install.userDataPath)}</span>
  </div>
  ${rows.join('\n  ')}
  <div class="total-row"><span>Total</span><span>${esc(fmtBytes(installTotal))}</span></div>
</div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  display: flex; flex-direction: column; height: 100vh;
  font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
  color: var(--vscode-foreground); background: var(--vscode-editor-background);
}
.page-header {
  width: 100%; max-width: 900px; margin: 0 auto;
  display: flex; justify-content: center; flex-shrink: 0;
  border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
}
.page-header-inner { text-align: center; padding: 20px 20px 16px; }
.page-title { font-size: 1.2em; font-weight: 600; margin-bottom: 4px; }
.page-subtitle { font-size: 1em; color: var(--vscode-descriptionForeground); }
.content {
  flex: 1; overflow-y: auto; padding: 16px 0 24px;
  display: flex; flex-direction: column; align-items: center;
}
.content-inner { width: 100%; max-width: 900px; border-radius: .8rem; background-color: #1c2c35; }
.install-block { margin-bottom: 4px; }
.install-header {
  padding: 14px 20px; font-weight: 600;
  border-bottom: 1px solid rgba(128,128,128,0.3);
  display: flex; align-items: baseline; gap: 10px;
}
.install-name { color: var(--vscode-foreground); }
.install-path { font-size: 0.84em; color: var(--vscode-descriptionForeground); font-weight: 400; }
.item-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 7px 20px;
  border-bottom: 1px solid rgba(128,128,128,0.08);
}
.item-row.permanent .item-name { color: #f1934c; }
.item-meta { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.item-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.risk-tag { flex-shrink: 0; font-size: 0.78em; color: #f1934c; opacity: 0.75; }
.item-right {
  flex-shrink: 0; display: flex; align-items: center; gap: 8px;
  font-size: 0.9em; color: var(--vscode-descriptionForeground); white-space: nowrap;
}
.item-count { font-size: 0.84em; opacity: 0.6; }
.total-row {
  display: flex; justify-content: space-between;
  padding: 10px 20px; font-weight: 600;
  border-top: 1px solid rgba(128,128,128,0.3); margin-top: 2px;
}
</style>
</head>
<body>
<div class="page-header">
  <div class="page-header-inner">
    <div class="page-title">Maintenance Butler — Disk Usage</div>
    <div class="page-subtitle">Grand total: ${esc(fmtBytes(grandTotal))}</div>
  </div>
</div>
<div class="content">
  <div class="content-inner">
    ${sections.join('\n    ')}
  </div>
</div>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Clean Panel internals ─────────────────────────────────────────────

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildHtml(items: SerializedItem[], totalBytes: number, nonce: string, rememberedWsChecked?: Record<string, string[]>, showDescriptions = true): string {
  const itemsJson = JSON.stringify(items);
  const rememberedWsJson = JSON.stringify(rememberedWsChecked ?? null);
  const totalStr = fmtBytes(totalBytes);
  const showDescriptionsJs = showDescriptions ? 'true' : 'false';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  --vscode-badge-background: rgba(0, 0, 0, 0.5);
  --vscode-badge-foreground: #afafaf;
}

.page-header {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  justify-content: center;
  border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
  flex-shrink: 0;
}

.page-header-inner {
  text-align: center;
  width: fit-content;
  max-width: 900px;
  padding: 20px 20px 16px;
}

.page-title {
  font-size: 1.2em;
  font-weight: 600;
  margin-bottom: 4px;
}

.page-subtitle {
  font-size: 1em;
  color: var(--vscode-descriptionForeground);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.content-inner {
  width: 100%;
  max-width: 900px;
  border-radius: .8rem;
  background-color: #1c2c35;
}

.section-label {
  padding: 16px 20px 16px;
  font-size: 1.05em;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vscode-descriptionForeground);
  border-bottom: 1px solid rgba(128, 128, 128, 0.4);
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-label.danger {
  color: #f1934c;
  margin-top: 30px;
}

.section-badge {
  flex-shrink: 0;
  font-size: 0.82em;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  white-space: nowrap;
  text-transform: none;
  letter-spacing: 0;
}

.section-badge.danger {
  color: #f1934c;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 20px;
  cursor: pointer;
  user-select: none;
}

.item-row:hover { background: var(--vscode-list-hoverBackground); }

.item-row input[type="checkbox"] {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--vscode-button-background);
}

.item-meta { flex: 1; min-width: 0; }

.item-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-detail {
  font-size: 0.84em;
  color: var(--vscode-descriptionForeground);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-badge {
  flex-shrink: 0;
  font-size: 0.82em;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  white-space: nowrap;
}

.item-row-empty {
  padding: 4px 20px 4px 44px;
  font-size: 0.84em;
  color: var(--vscode-descriptionForeground);
  opacity: 0.65;
  font-style: italic;
}

/* Workspace accordion */
.ws-accordion {
  display: none;
  margin: 0 20px 4px 44px;
  padding: 4px 0 4px 12px;
  border-left: 2px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
}

.ws-accordion.open { display: block; }

.ws-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px dashed rgba(128, 128, 128, 0.30);
}

.ws-entry:hover { background: var(--vscode-list-hoverBackground); }

.ws-entry input[type="checkbox"] {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  cursor: pointer;
  accent-color: var(--vscode-button-background);
}

.ws-entry-path {
  flex: 1;
  font-size: 0.84em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-entry-path.orphaned { color: #ba8749; }

.ws-entry-size {
  flex-shrink: 0;
  font-size: 0.8em;
  color: var(--vscode-descriptionForeground);
}

.ws-empty {
  font-size: 0.84em;
  color: var(--vscode-descriptionForeground);
  padding: 6px 0;
  opacity: 0.7;
}

/* Footer */
.footer {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
  flex-shrink: 0;
}

.footer-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: 900px;
  padding: 22px 20px 22px;
}

.btn {
  padding: 6px 14px;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: var(--vscode-font-size);
  font-family: var(--vscode-font-family);
}

.btn:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }

.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>

<div class="page-header">
  <div class="page-header-inner">
    <div class="page-title">Maintenance Butler — Clean</div>
    <div class="page-subtitle">${totalStr} available</div>
  </div>
</div>

<div class="content" id="content"></div>

<div class="footer">
  <div class="footer-inner">
    <button class="btn btn-primary" id="cleanBtn" disabled>Nothing selected</button>
    <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
  </div>
</div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const ITEMS = ${itemsJson};
  const REMEMBERED_WS = ${rememberedWsJson};
  const SHOW_DESCRIPTIONS = ${showDescriptionsJs};

  // ── State ──────────────────────────────────────────────────────────────────
  const checked = new Set();      // Set<itemKey>
  const wsChecked = new Map();    // Map<itemKey, Set<storagePath>>
  var lastCleanBtnText = '';

  ITEMS.forEach(function (item) {
    if (item.defaultChecked) checked.add(item.key);
    if (item.isWorkspacePicker && item.workspaceEntries) {
      if (REMEMBERED_WS && REMEMBERED_WS[item.key]) {
        wsChecked.set(item.key, new Set(REMEMBERED_WS[item.key]));
      } else {
        wsChecked.set(item.key, new Set(
          item.workspaceEntries
            .filter(function (e) { return e.isOrphaned; })
            .map(function (e) { return e.storagePath; })
        ));
      }
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fmtBytes(b) {
    if (b === 0) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function wsSelectedSize(item) {
    var paths = wsChecked.get(item.key);
    if (!paths || paths.size === 0) return 0;
    return (item.workspaceEntries || [])
      .filter(function (e) { return paths.has(e.storagePath); })
      .reduce(function (s, e) { return s + e.sizeBytes; }, 0);
  }

  function computeSelection() {
    var selectedKeys = [], wsMap = {}, totalSize = 0, count = 0;
    ITEMS.forEach(function (item) {
      if (!checked.has(item.key)) return;
      if (item.isWorkspacePicker) {
        var paths = wsChecked.get(item.key);
        if (!paths || paths.size === 0) return;
        wsMap[item.key] = Array.from(paths);
        totalSize += wsSelectedSize(item);
      } else {
        totalSize += item.sizeBytes;
      }
      selectedKeys.push(item.key);
      count++;
    });
    return { selectedKeys: selectedKeys, wsMap: wsMap, totalSize: totalSize, count: count };
  }

  function updateFooter() {
    var s = computeSelection();
    var btn = document.getElementById('cleanBtn');
    if (s.count === 0) {
      btn.disabled = true;
      btn.textContent = 'Nothing selected';
    } else {
      btn.disabled = false;
      btn.textContent = 'Clean ' + s.count + ' item' + (s.count !== 1 ? 's' : '') + '  ·  ' + fmtBytes(s.totalSize);
    }
    updateSectionBadges();
  }

  function updateSectionBadges() {
    var sums = {};
    ITEMS.forEach(function(item) {
      if (!sums[item.risk]) sums[item.risk] = 0;
      if (!checked.has(item.key)) return;
      sums[item.risk] += item.isWorkspacePicker ? wsSelectedSize(item) : item.sizeBytes;
    });
    Object.keys(sectionInfo).forEach(function(risk) {
      var info = sectionInfo[risk];
      var sel = sums[risk] || 0;
      info.badgeEl.textContent = fmtBytes(sel) + ' / ' + fmtBytes(info.totalBytes);
    });
  }

  // ── DOM build ──────────────────────────────────────────────────────────────
  var contentInner = document.createElement('div');
  contentInner.className = 'content-inner';
  document.getElementById('content').appendChild(contentInner);
  var content = contentInner;
  var lastRisk = null;
  var sectionInfo = {};

  ITEMS.forEach(function (item) {
    // Section header on risk transition
    if (item.risk !== lastRisk) {
      var sectionTotal = ITEMS
        .filter(function(i) { return i.risk === item.risk; })
        .reduce(function(s, i) { return s + i.sizeBytes; }, 0);
      var hdr = document.createElement('div');
      hdr.className = 'section-label' + (item.risk === 'permanent' ? ' danger' : '');
      var hdrText = document.createElement('span');
      hdrText.textContent = item.risk === 'permanent'
        ? '⚠️  Your History — permanently deleted, cannot be recovered'
        : 'Caches & Logs — auto-regenerated, safe to clean';
      var hdrBadge = document.createElement('span');
      hdrBadge.className = 'section-badge' + (item.risk === 'permanent' ? ' danger' : '');
      hdr.appendChild(hdrText);
      hdr.appendChild(hdrBadge);
      content.appendChild(hdr);
      sectionInfo[item.risk] = { badgeEl: hdrBadge, totalBytes: sectionTotal };
      lastRisk = item.risk;
    }

    // Empty state — title without checkbox, "nothing to clean" as detail
    if (item.sizeBytes === 0 && item.itemCount === 0) {
      var emptyRow = document.createElement('div');
      emptyRow.className = 'item-row';
      emptyRow.style.cursor = 'default';
      var spacer = document.createElement('div');
      spacer.style.cssText = 'width:14px;flex-shrink:0';
      var emptyMeta = document.createElement('div');
      emptyMeta.className = 'item-meta';
      var emptyName = document.createElement('div');
      emptyName.className = 'item-name';
      emptyName.textContent = item.label;
      emptyMeta.appendChild(emptyName);
      if (SHOW_DESCRIPTIONS) {
        var emptyDetail = document.createElement('div');
        emptyDetail.className = 'item-detail';
        emptyDetail.textContent = 'No items, nothing to clean';
        emptyMeta.appendChild(emptyDetail);
      }
      emptyRow.appendChild(spacer);
      emptyRow.appendChild(emptyMeta);
      content.appendChild(emptyRow);
      return;
    }

    // Row
    var row = document.createElement('div');
    row.className = 'item-row';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked.has(item.key);

    var meta = document.createElement('div');
    meta.className = 'item-meta';

    var nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = item.label;

    meta.appendChild(nameEl);
    if (SHOW_DESCRIPTIONS) {
      var detailEl = document.createElement('div');
      detailEl.className = 'item-detail';
      detailEl.innerHTML = item.detail;
      meta.appendChild(detailEl);
    }

    var badge = document.createElement('span');
    badge.className = 'item-badge';
    if (item.isWorkspacePicker) {
      badge.textContent = fmtBytes(checked.has(item.key) ? wsSelectedSize(item) : 0) + ' / ' + fmtBytes(item.sizeBytes);
    } else {
      badge.textContent = fmtBytes(checked.has(item.key) ? item.sizeBytes : 0) + ' / ' + fmtBytes(item.sizeBytes);
    }

    row.appendChild(cb);
    row.appendChild(meta);
    row.appendChild(badge);
    content.appendChild(row);

    // Workspace accordion
    var accordion = null;
    if (item.isWorkspacePicker) {
      accordion = buildWsAccordion(item, badge);
      content.appendChild(accordion);
      if (checked.has(item.key)) accordion.classList.add('open');
    }

    function handleToggle() {
      if (cb.checked) {
        checked.add(item.key);
        if (accordion) accordion.classList.add('open');
        badge.textContent = (item.isWorkspacePicker ? fmtBytes(wsSelectedSize(item)) : fmtBytes(item.sizeBytes)) + ' / ' + fmtBytes(item.sizeBytes);
      } else {
        checked.delete(item.key);
        if (accordion) accordion.classList.remove('open');
        badge.textContent = '0 B / ' + fmtBytes(item.sizeBytes);
      }
      updateFooter();
    }

    row.addEventListener('click', function (e) { if (e.target !== cb) { cb.checked = !cb.checked; handleToggle(); } });
    cb.addEventListener('change', handleToggle);
  });

  // ── Workspace accordion builder ────────────────────────────────────────────
  function buildWsAccordion(item, badge) {
    var entries = item.workspaceEntries || [];
    var container = document.createElement('div');
    container.className = 'ws-accordion';

    if (entries.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'ws-empty';
      empty.textContent = 'No workspace storage entries found.';
      container.appendChild(empty);
      return container;
    }

    var entryCbs = [];

    // Select All row
    var saRow = document.createElement('div');
    saRow.className = 'ws-entry';
    var saCb = document.createElement('input');
    saCb.type = 'checkbox';
    var initPaths = wsChecked.get(item.key) || new Set();
    saCb.checked = initPaths.size > 0 && initPaths.size === entries.length;
    saCb.indeterminate = initPaths.size > 0 && initPaths.size < entries.length;
    var saLabel = document.createElement('span');
    saLabel.className = 'ws-entry-path';
    saLabel.style.fontWeight = '500';
    saLabel.textContent = 'Select All  (' + entries.length + ' workspace' + (entries.length !== 1 ? 's' : '') + ')';
    saRow.appendChild(saCb);
    saRow.appendChild(saLabel);
    container.appendChild(saRow);

    function refreshSelectAll() {
      var cur = wsChecked.get(item.key) || new Set();
      saCb.checked = cur.size > 0 && cur.size === entries.length;
      saCb.indeterminate = cur.size > 0 && cur.size < entries.length;
      badge.textContent = fmtBytes(wsSelectedSize(item)) + ' / ' + fmtBytes(item.sizeBytes);
      updateFooter();
    }

    function addEntry(entry) {
      var eRow = document.createElement('div');
      eRow.className = 'ws-entry';

      var eCb = document.createElement('input');
      eCb.type = 'checkbox';
      var initSet = wsChecked.get(item.key) || new Set();
      eCb.checked = initSet.has(entry.storagePath);

      var ePath = document.createElement('span');
      ePath.className = 'ws-entry-path' + (entry.isOrphaned ? ' orphaned' : '');
      ePath.textContent = entry.projectPath;
      ePath.title = entry.projectPath;

      var eSize = document.createElement('span');
      eSize.className = 'ws-entry-size';
      eSize.textContent = fmtBytes(entry.sizeBytes);

      eRow.appendChild(eCb);
      eRow.appendChild(ePath);
      eRow.appendChild(eSize);
      container.appendChild(eRow);
      entryCbs.push(eCb);

      function toggle() {
        var set = wsChecked.get(item.key) || new Set();
        if (eCb.checked) set.add(entry.storagePath); else set.delete(entry.storagePath);
        wsChecked.set(item.key, set);
        refreshSelectAll();
      }

      eCb.addEventListener('change', toggle);
      eRow.addEventListener('click', function (e) { if (e.target !== eCb) { eCb.checked = !eCb.checked; toggle(); } });
    }

    entries.forEach(addEntry);

    function selectAllToggle() {
      var newSet = new Set();
      if (saCb.checked) entries.forEach(function (e) { newSet.add(e.storagePath); });
      wsChecked.set(item.key, newSet);
      entryCbs.forEach(function (eCb) { eCb.checked = saCb.checked; });
      badge.textContent = fmtBytes(wsSelectedSize(item)) + ' / ' + fmtBytes(item.sizeBytes);
      updateFooter();
    }

    saCb.addEventListener('change', selectAllToggle);
    saRow.addEventListener('click', function (e) { if (e.target !== saCb) { saCb.checked = !saCb.checked; selectAllToggle(); } });

    return container;
  }

  // ── Footer buttons ─────────────────────────────────────────────────────────
  document.getElementById('cleanBtn').addEventListener('click', function () {
    lastCleanBtnText = this.textContent;
    var s = computeSelection();
    vscode.postMessage({
      type: 'clean',
      selected: s.selectedKeys,
      workspaceStorageMap: Object.keys(s.wsMap).length > 0 ? s.wsMap : undefined,
    });
  });

  document.getElementById('cancelBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'cancel' });
  });

  // ── Receive messages from extension ──────────────────────────────────────
  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg.type === 'cleanCancelled') {
      var btn = document.getElementById('cleanBtn');
      btn.disabled = false;
      btn.textContent = lastCleanBtnText;
      var cbtn = document.getElementById('cancelBtn');
      cbtn.disabled = false;
      cbtn.style.opacity = '';
    } else if (msg.type === 'cleanStart') {
      var btn = document.getElementById('cleanBtn');
      btn.disabled = true;
      btn.textContent = 'Cleaning…';
      var cbtn = document.getElementById('cancelBtn');
      cbtn.disabled = true;
      cbtn.style.opacity = '0.4';
    } else if (msg.type === 'cleanDone') {
      showResults(msg.bytesFreed, msg.errors);
    }
  });

  function showResults(bytesFreed, errors) {
    var contentEl = document.getElementById('content');
    contentEl.innerHTML = '';
    var inner = document.createElement('div');
    inner.className = 'content-inner';
    inner.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;min-height:200px;';
    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:2.5em;color:' + (errors && errors.length > 0 ? '#f1934c' : 'var(--vscode-terminal-ansiGreen, #4ec9b0)') + ';';
    icon.textContent = (errors && errors.length > 0) ? '⚠' : '✓';
    var titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:1.4em;font-weight:600;';
    titleEl.textContent = 'Freed ' + fmtBytes(bytesFreed);
    inner.appendChild(icon);
    inner.appendChild(titleEl);
    if (errors && errors.length > 0) {
      var errWrap = document.createElement('div');
      errWrap.style.cssText = 'width:100%;max-width:600px;margin-top:8px;';
      var errHdr = document.createElement('div');
      errHdr.style.cssText = 'font-size:0.88em;color:var(--vscode-descriptionForeground);margin-bottom:6px;';
      errHdr.textContent = errors.length + ' file' + (errors.length !== 1 ? 's' : '') + ' skipped (locked by VS Code):';
      errWrap.appendChild(errHdr);
      for (var i = 0; i < Math.min(errors.length, 5); i++) {
        var errLine = document.createElement('div');
        errLine.style.cssText = 'font-size:0.82em;color:var(--vscode-descriptionForeground);padding:1px 0;opacity:0.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        errLine.textContent = '• ' + errors[i];
        errWrap.appendChild(errLine);
      }
      if (errors.length > 5) {
        var moreEl = document.createElement('div');
        moreEl.style.cssText = 'font-size:0.82em;color:var(--vscode-descriptionForeground);padding:1px 0;opacity:0.55;';
        moreEl.textContent = '… and ' + (errors.length - 5) + ' more';
        errWrap.appendChild(moreEl);
      }
      inner.appendChild(errWrap);
    }
    contentEl.appendChild(inner);
    var footerInner = document.querySelector('.footer-inner');
    footerInner.innerHTML = '';
    var scanBtn = document.createElement('button');
    scanBtn.className = 'btn btn-secondary';
    scanBtn.textContent = 'Scan Again';
    scanBtn.addEventListener('click', function() {
      var remWs = {};
      wsChecked.forEach(function(paths, key) { remWs[key] = Array.from(paths); });
      vscode.postMessage({ type: 'rescan', rememberedChecked: Array.from(checked), rememberedWsChecked: remWs });
    });
    var closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-primary';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function() { vscode.postMessage({ type: 'close' }); });
    footerInner.appendChild(scanBtn);
    footerInner.appendChild(closeBtn);
  }

  updateFooter();
}());
</script>
</body>
</html>`;
}
