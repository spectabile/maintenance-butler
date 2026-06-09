import * as vscode from 'vscode';
import { detectInstalls } from './paths';
import { scanAll, findAllWorkspaceEntries } from './scanner';
import { cleanTarget } from './cleaner';
import { ScanResult } from './types';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('maintenanceButler.clean', runClean),
    vscode.commands.registerCommand('maintenanceButler.showDiskUsage', runShowDiskUsage)
  );
}

export function deactivate(): void {}

// ---------------------------------------------------------------------------

async function runClean(): Promise<void> {
  const installs = detectInstalls();
  if (installs.length === 0) {
    vscode.window.showWarningMessage(
      'Maintenance Butler: No VS Code installations found. Check the portableDataPath setting.'
    );
    return;
  }

  let results: ScanResult[] = [];
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Maintenance Butler: Scanning…', cancellable: false },
    async () => { results = await scanAll(installs); }
  );

  const cleanable = results.filter(r => r.sizeBytes > 0 || r.itemCount > 0);
  if (cleanable.length === 0) {
    vscode.window.showInformationMessage('Maintenance Butler: Nothing to clean — already tidy!');
    return;
  }

  const config = vscode.workspace.getConfiguration('maintenanceButler');
  const multiInstall = installs.length > 1;
  const totalBytes = cleanable.reduce((sum, r) => sum + r.sizeBytes, 0);

  type CleanPickItem = vscode.QuickPickItem & { scanResult?: ScanResult };
  type CleanPickItemWithResult = vscode.QuickPickItem & { scanResult: ScanResult };

  const items: CleanPickItem[] = [];
  let lastRisk: string | null = null;
  for (const r of cleanable) {
    if (r.target.risk !== lastRisk) {
      items.push({
        label: r.target.risk === 'permanent'
          ? '⚠️  Your History — permanently deleted, cannot be recovered'
          : 'Caches & Logs — auto-regenerated, safe to clean',
        kind: vscode.QuickPickItemKind.Separator,
      });
      lastRisk = r.target.risk;
    }
    const isEnabled: boolean = config.get(r.target.configKey, r.target.defaultEnabled);
    const installPrefix = multiInstall ? `[${r.install.name}] ` : '';
    items.push({
      label: `${installPrefix}${r.target.label}`,
      description: formatBytes(r.sizeBytes) + (r.itemCount > 1 ? ` · ${r.itemCount} items` : ''),
      detail: r.target.risk === 'permanent' ? `⚠️ ${r.target.warning}` : r.target.detail,
      picked: isEnabled,
      scanResult: r,
    });
  }

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: `Maintenance Butler — ${formatBytes(totalBytes)} available`,
    placeHolder: 'Select items to clean  (Space = toggle, Enter = confirm)',
  });

  const selectedWithResults = (selected ?? []).filter((s): s is CleanPickItemWithResult => s.scanResult != null);
  if (selectedWithResults.length === 0) return;

  // For workspace-storage-picker items, resolve the secondary picker before the warning
  type SelectedItem = CleanPickItemWithResult;
  interface ResolvedItem { item: SelectedItem; resolvedPaths?: string[] }
  const resolved: ResolvedItem[] = [];
  for (const item of selectedWithResults) {
    if (item.scanResult.target.cleanMode === 'workspace-storage-picker') {
      const paths = await showWorkspaceStoragePicker(item.scanResult.paths[0]);
      if (!paths || paths.length === 0) continue; // user cancelled the picker
      resolved.push({ item, resolvedPaths: paths });
    } else {
      resolved.push({ item });
    }
  }
  if (resolved.length === 0) return;

  // Warn before permanent deletions
  const permanent = resolved.filter(r => r.item.scanResult.target.risk === 'permanent');
  if (permanent.length > 0) {
    const lines = permanent.map(r => `• ${r.item.scanResult.target.label}: ${r.item.scanResult.target.warning}`).join('\n');
    const choice = await vscode.window.showWarningMessage(
      `⚠️ WARNING — Permanent deletion!\n\nThe following cannot be recovered after cleaning:\n\n${lines}\n\nAre you sure you want to continue?`,
      { modal: true },
      'Yes, delete permanently',
      'Cancel'
    );
    if (choice !== 'Yes, delete permanently') return;
  }

  // Dry run
  const dryRun: boolean = config.get('dryRun', false);
  if (dryRun) {
    const total = resolved.reduce((sum, r) => sum + r.item.scanResult.sizeBytes, 0);
    vscode.window.showInformationMessage(
      `Maintenance Butler (dry run): would free ${formatBytes(total)} across ${resolved.length} item(s).`
    );
    return;
  }

  // Clean
  const historyMaxAgeDays: number = config.get('historyMaxAgeDays', 30);
  let totalFreed = 0;
  const allErrors: string[] = [];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Maintenance Butler: Cleaning…', cancellable: false },
    async (progress) => {
      for (const { item, resolvedPaths } of resolved) {
        progress.report({
          message: item.scanResult.target.label,
          increment: 100 / resolved.length,
        });
        const scanResult = resolvedPaths
          ? { ...item.scanResult, paths: resolvedPaths }
          : item.scanResult;
        const result = await cleanTarget(scanResult, { historyMaxAgeDays });
        totalFreed += result.bytesFreed;
        allErrors.push(...result.errors);
      }
    }
  );

  if (allErrors.length > 0) {
    const channel = vscode.window.createOutputChannel('Maintenance Butler');
    channel.appendLine('Errors during cleanup:');
    allErrors.forEach(e => channel.appendLine(`  • ${e}`));
    channel.show();
    vscode.window.showWarningMessage(
      `Maintenance Butler: Freed ${formatBytes(totalFreed)} with ${allErrors.length} error(s). See Output panel.`
    );
  } else {
    vscode.window.showInformationMessage(`Maintenance Butler: Freed ${formatBytes(totalFreed)} — done!`);
  }
}

// ---------------------------------------------------------------------------

async function runShowDiskUsage(): Promise<void> {
  const installs = detectInstalls();
  if (installs.length === 0) {
    vscode.window.showWarningMessage('Maintenance Butler: No VS Code installations found.');
    return;
  }

  let results: ScanResult[] = [];
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Maintenance Butler: Scanning…', cancellable: false },
    async () => { results = await scanAll(installs); }
  );

  const channel = vscode.window.createOutputChannel('Maintenance Butler');
  channel.clear();
  channel.appendLine('Maintenance Butler — Disk Usage Report');
  channel.appendLine('='.repeat(52));

  let grandTotal = 0;
  for (const install of installs) {
    const installResults = results.filter(r => r.install.name === install.name && r.sizeBytes > 0);
    if (installResults.length === 0) continue;

    channel.appendLine('');
    channel.appendLine(`[${install.name}]  ${install.userDataPath}`);

    let installTotal = 0;
    for (const r of installResults) {
      const risk = r.target.risk === 'permanent' ? '  ⚠ permanent' : '';
      const items = r.itemCount > 1 ? ` (${r.itemCount} items)` : '';
      channel.appendLine(
        `  ${r.target.label.padEnd(42)} ${formatBytes(r.sizeBytes).padStart(10)}${items}${risk}`
      );
      installTotal += r.sizeBytes;
    }
    channel.appendLine(`  ${'─'.repeat(54)}`);
    channel.appendLine(`  ${'Total'.padEnd(42)} ${formatBytes(installTotal).padStart(10)}`);
    grandTotal += installTotal;
  }

  channel.appendLine('');
  channel.appendLine(`Grand total: ${formatBytes(grandTotal)}`);
  channel.show();
}

// ---------------------------------------------------------------------------

async function showWorkspaceStoragePicker(storagePath: string): Promise<string[] | undefined> {
  const currentPaths: string[] = [];
  vscode.workspace.workspaceFolders?.forEach(f => currentPaths.push(f.uri.fsPath.toLowerCase()));
  if (vscode.workspace.workspaceFile) currentPaths.push(vscode.workspace.workspaceFile.fsPath.toLowerCase());

  const entries = await findAllWorkspaceEntries(storagePath, currentPaths);
  if (entries.length === 0) {
    vscode.window.showInformationMessage('Maintenance Butler: No workspace storage entries found.');
    return undefined;
  }

  entries.sort((a, b) => {
    if (a.isOrphaned !== b.isOrphaned) return a.isOrphaned ? -1 : 1;
    return a.projectPath.localeCompare(b.projectPath);
  });

  const orphanedEntries = entries.filter(e => e.isOrphaned);
  const activeEntries  = entries.filter(e => !e.isOrphaned);

  interface WorkspacePickItem extends vscode.QuickPickItem {
    storagePath?: string;
    isSelectAll?: boolean;
  }

  const totalSize = entries.reduce((s, e) => s + e.sizeBytes, 0);
  const selectAllItem: WorkspacePickItem = {
    label: '$(check-all) Select All',
    description: `${entries.length} workspaces · ${formatBytes(totalSize)}`,
    isSelectAll: true,
  };

  const orphanedItems: WorkspacePickItem[] = orphanedEntries.map(e => ({
    label: e.projectPath,
    description: formatBytes(e.sizeBytes),
    detail: 'Project folder no longer exists on disk',
    storagePath: e.storagePath,
  }));

  const activeItems: WorkspacePickItem[] = activeEntries.map(e => ({
    label: e.projectPath,
    description: formatBytes(e.sizeBytes),
    detail: 'Project folder still exists on disk',
    storagePath: e.storagePath,
  }));

  const regularItems: WorkspacePickItem[] = [...orphanedItems, ...activeItems];

  const allItems: WorkspacePickItem[] = [
    selectAllItem,
    ...(orphanedItems.length > 0 ? [
      { label: 'Orphaned — project folder deleted', kind: vscode.QuickPickItemKind.Separator } as WorkspacePickItem,
      ...orphanedItems,
    ] : []),
    ...(activeItems.length > 0 ? [
      { label: 'Active workspaces', kind: vscode.QuickPickItemKind.Separator } as WorkspacePickItem,
      ...activeItems,
    ] : []),
  ];

  const qp = vscode.window.createQuickPick<WorkspacePickItem>();
  qp.canSelectMany = true;
  qp.title = 'Maintenance Butler — Choose workspace states to delete';
  qp.placeholder = 'Space = toggle · Enter = confirm · currently open workspace is excluded';
  qp.items = allItems;
  qp.selectedItems = orphanedItems;

  let prevSelected = new Set<WorkspacePickItem>(orphanedItems);
  let ignoreChange = false;

  qp.onDidChangeSelection(newSelected => {
    if (ignoreChange) return;
    ignoreChange = true;

    const prevHadSelectAll = prevSelected.has(selectAllItem);
    const nowHasSelectAll  = newSelected.includes(selectAllItem);

    if (!prevHadSelectAll && nowHasSelectAll) {
      qp.selectedItems = [selectAllItem, ...regularItems];
    } else if (prevHadSelectAll && !nowHasSelectAll) {
      qp.selectedItems = [];
    } else if (prevHadSelectAll && nowHasSelectAll) {
      // A regular item was unchecked — drop Select All too
      qp.selectedItems = newSelected.filter(s => !s.isSelectAll);
    }

    prevSelected = new Set(qp.selectedItems);
    ignoreChange = false;
  });

  return new Promise<string[] | undefined>(resolve => {
    qp.onDidAccept(() => {
      const chosen = qp.selectedItems.filter(s => !s.isSelectAll && s.storagePath);
      qp.dispose();
      resolve(chosen.length > 0 ? chosen.map(s => s.storagePath!) : undefined);
    });
    qp.onDidHide(() => { qp.dispose(); resolve(undefined); });
    qp.show();
  });
}

// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
