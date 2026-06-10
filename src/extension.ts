import * as vscode from 'vscode';
import { detectInstalls } from './paths';
import { scanAll } from './scanner';
import { cleanTarget } from './cleaner';
import { ScanResult } from './types';
import { showCleanPanel, buildCleanPanelHtml, showDiskUsagePanel } from './webview';

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

  const config = vscode.workspace.getConfiguration('maintenanceButler');
  const multiInstall = installs.length > 1;

  // Include items that have content OR that the user has explicitly enabled in settings
  const cleanable = results.filter(r =>
    r.sizeBytes > 0 || r.itemCount > 0 ||
    config.get<boolean>(r.target.configKey, r.target.defaultEnabled)
  );
  if (cleanable.length === 0) {
    vscode.window.showInformationMessage('Maintenance Butler: Nothing to clean — already tidy!');
    return;
  }

  await showCleanPanel(cleanable, config, multiInstall, {
    onClean: async (selection, panel) => {
      const { selected: selectedResults, workspaceStorageMap } = selection;

      // Warn before permanent deletions — panel stays open behind dialog
      const permanent = selectedResults.filter(r => r.target.risk === 'permanent' && r.target.warning);
      if (permanent.length > 0) {
        const lines = permanent.map(r => `• ${r.target.label}: ${r.target.warning}`).join('\n');
        const choice = await vscode.window.showWarningMessage(
          `WARNING — Permanent deletion!\n\nThe following cannot be recovered after cleaning:\n\n${lines}\n\nAre you sure you want to continue?`,
          { modal: true },
          'Yes, delete permanently'
        );
        if (choice !== 'Yes, delete permanently') {
          panel.webview.postMessage({ type: 'cleanCancelled' });
          return;
        }
      }

      // Dry run
      const dryRun: boolean = config.get('dryRun', false);
      if (dryRun) {
        const total = selectedResults.reduce((sum, r) => sum + r.sizeBytes, 0);
        panel.webview.postMessage({ type: 'cleanDone', bytesFreed: total, errors: [], dryRun: true });
        return;
      }

      panel.webview.postMessage({ type: 'cleanStart' });

      const historyMaxAgeDays: number = config.get('historyMaxAgeDays', 30);
      let totalFreed = 0;
      const allErrors: string[] = [];

      for (const scanResult of selectedResults) {
        const itemKey = `${scanResult.target.id}:${scanResult.install.name}`;
        const pickerPaths = workspaceStorageMap?.[itemKey];
        const effectiveScanResult = pickerPaths?.length
          ? { ...scanResult, paths: pickerPaths }
          : scanResult;
        const result = await cleanTarget(effectiveScanResult, { historyMaxAgeDays });
        totalFreed += result.bytesFreed;
        allErrors.push(...result.errors);
      }

      panel.webview.postMessage({ type: 'cleanDone', bytesFreed: totalFreed, errors: allErrors });
    },

    onRescan: async (panel, rememberedState) => {
      let newResults: ScanResult[] = [];
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Maintenance Butler: Scanning…', cancellable: false },
        async () => { newResults = await scanAll(installs); }
      );
      const newConfig = vscode.workspace.getConfiguration('maintenanceButler');
      const newCleanable = newResults.filter(r =>
        r.sizeBytes > 0 || r.itemCount > 0 ||
        newConfig.get<boolean>(r.target.configKey, r.target.defaultEnabled)
      );
      panel.webview.html = buildCleanPanelHtml(newCleanable, newConfig, multiInstall, rememberedState);
    },
  });
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

  showDiskUsagePanel(results, installs);
}

// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
