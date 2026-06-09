import * as vscode from 'vscode';
import { ScanResult } from './types';

export interface CleanSelection {
  selected: ScanResult[];
  workspaceStoragePaths?: string[];
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

export async function showCleanPanel(
  results: ScanResult[],
  config: vscode.WorkspaceConfiguration,
  multiInstall: boolean
): Promise<CleanSelection | undefined> {
  const panel = vscode.window.createWebviewPanel(
    'maintenanceButlerClean',
    'Maintenance Butler — Clean',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const totalBytes = results.reduce((sum, r) => sum + r.sizeBytes, 0);
  const nonce = generateNonce();

  const serialized: SerializedItem[] = results.map(r => {
    const isEnabled: boolean = config.get(r.target.configKey, r.target.defaultEnabled);
    const installPrefix = multiInstall ? `[${r.install.name}] ` : '';
    const item: SerializedItem = {
      key: `${r.target.id}:${r.install.name}`,
      label: `${installPrefix}${r.target.label}`,
      detail: r.target.detail,
      sizeBytes: r.sizeBytes,
      itemCount: r.itemCount,
      risk: r.target.risk,
      defaultChecked: isEnabled,
      isWorkspacePicker: r.target.cleanMode === 'workspace-storage-picker',
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

  panel.webview.html = buildHtml(serialized, totalBytes, nonce);

  return new Promise<CleanSelection | undefined>(resolve => {
    let resolved = false;
    const finish = (result: CleanSelection | undefined) => {
      if (resolved) return;
      resolved = true;
      panel.dispose();
      resolve(result);
    };

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'clean') {
        const keySet = new Set<string>(msg.selected as string[]);
        const selected = results.filter(r => keySet.has(`${r.target.id}:${r.install.name}`));
        finish({ selected, workspaceStoragePaths: msg.workspaceStoragePaths });
      } else if (msg.type === 'cancel') {
        finish(undefined);
      }
    });

    panel.onDidDispose(() => finish(undefined));
  });
}

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

function buildHtml(items: SerializedItem[], totalBytes: number, nonce: string): string {
  const itemsJson = JSON.stringify(items);
  const totalStr = fmtBytes(totalBytes);

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
  overflow: hidden;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

.page-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
  flex-shrink: 0;
}

.page-title {
  font-size: 1.1em;
  font-weight: 600;
  margin-bottom: 4px;
}

.page-subtitle {
  font-size: 0.88em;
  color: var(--vscode-descriptionForeground);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 4px;
}

.section-label {
  padding: 10px 20px 5px;
  font-size: 1.05em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vscode-descriptionForeground);
}

.section-label.danger {
  color: var(--vscode-editorError-foreground, #f48771);
}

.item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 20px;
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
  font-size: 0.78em;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  min-width: 60px;
  text-align: right;
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

.ws-subheader {
  font-size: 0.76em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vscode-descriptionForeground);
  padding: 6px 0 3px;
  opacity: 0.7;
}

.ws-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  cursor: pointer;
  user-select: none;
}

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

.ws-entry-path.orphaned { color: var(--vscode-editorWarning-foreground, #cca700); }

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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
  flex-shrink: 0;
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
  <div class="page-title">Maintenance Butler — Clean</div>
  <div class="page-subtitle">${totalStr} available</div>
</div>

<div class="content" id="content"></div>

<div class="footer">
  <button class="btn btn-primary" id="cleanBtn" disabled>Nothing selected</button>
  <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
</div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const ITEMS = ${itemsJson};

  // ── State ──────────────────────────────────────────────────────────────────
  const checked = new Set();      // Set<itemKey>
  const wsChecked = new Map();    // Map<itemKey, Set<storagePath>>

  ITEMS.forEach(function (item) {
    if (item.defaultChecked) checked.add(item.key);
    if (item.isWorkspacePicker && item.workspaceEntries) {
      wsChecked.set(item.key, new Set(
        item.workspaceEntries
          .filter(function (e) { return e.isOrphaned; })
          .map(function (e) { return e.storagePath; })
      ));
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
    var selectedKeys = [], wsPaths = [], totalSize = 0, count = 0;
    ITEMS.forEach(function (item) {
      if (!checked.has(item.key)) return;
      if (item.isWorkspacePicker) {
        var paths = wsChecked.get(item.key);
        if (!paths || paths.size === 0) return;
        paths.forEach(function (p) { wsPaths.push(p); });
        totalSize += wsSelectedSize(item);
      } else {
        totalSize += item.sizeBytes;
      }
      selectedKeys.push(item.key);
      count++;
    });
    return { selectedKeys: selectedKeys, wsPaths: wsPaths, totalSize: totalSize, count: count };
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
  }

  // ── DOM build ──────────────────────────────────────────────────────────────
  var content = document.getElementById('content');
  var lastRisk = null;

  ITEMS.forEach(function (item) {
    // Section header on risk transition
    if (item.risk !== lastRisk) {
      var hdr = document.createElement('div');
      hdr.className = 'section-label' + (item.risk === 'permanent' ? ' danger' : '');
      hdr.textContent = item.risk === 'permanent'
        ? '⚠️  Your History — permanently deleted, cannot be recovered'
        : 'Caches & Logs — auto-regenerated, safe to clean';
      content.appendChild(hdr);
      lastRisk = item.risk;
    }

    // Empty state — show info row instead of a checkbox
    if (item.sizeBytes === 0 && item.itemCount === 0) {
      var emptyRow = document.createElement('div');
      emptyRow.className = 'item-row-empty';
      emptyRow.textContent = item.label + ' — nothing to clean';
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

    var detailEl = document.createElement('div');
    detailEl.className = 'item-detail';
    detailEl.textContent = item.detail;

    meta.appendChild(nameEl);
    meta.appendChild(detailEl);

    var badge = document.createElement('span');
    badge.className = 'item-badge';
    badge.textContent = item.isWorkspacePicker ? fmtBytes(wsSelectedSize(item)) : fmtBytes(item.sizeBytes);

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
      } else {
        checked.delete(item.key);
        if (accordion) accordion.classList.remove('open');
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

    var orphaned = entries.filter(function (e) { return e.isOrphaned; });
    var active   = entries.filter(function (e) { return !e.isOrphaned; });
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
      badge.textContent = fmtBytes(wsSelectedSize(item));
      updateFooter();
    }

    function addSubheader(text) {
      var h = document.createElement('div');
      h.className = 'ws-subheader';
      h.textContent = text;
      container.appendChild(h);
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

    if (orphaned.length > 0) { addSubheader('Orphaned — project folder deleted'); orphaned.forEach(addEntry); }
    if (active.length > 0)   { addSubheader('Active workspaces'); active.forEach(addEntry); }

    function selectAllToggle() {
      var newSet = new Set();
      if (saCb.checked) entries.forEach(function (e) { newSet.add(e.storagePath); });
      wsChecked.set(item.key, newSet);
      entryCbs.forEach(function (eCb) { eCb.checked = saCb.checked; });
      badge.textContent = fmtBytes(wsSelectedSize(item));
      updateFooter();
    }

    saCb.addEventListener('change', selectAllToggle);
    saRow.addEventListener('click', function (e) { if (e.target !== saCb) { saCb.checked = !saCb.checked; selectAllToggle(); } });

    return container;
  }

  // ── Footer buttons ─────────────────────────────────────────────────────────
  document.getElementById('cleanBtn').addEventListener('click', function () {
    var s = computeSelection();
    vscode.postMessage({
      type: 'clean',
      selected: s.selectedKeys,
      workspaceStoragePaths: s.wsPaths.length > 0 ? s.wsPaths : undefined,
    });
  });

  document.getElementById('cancelBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'cancel' });
  });

  updateFooter();
}());
</script>
</body>
</html>`;
}
