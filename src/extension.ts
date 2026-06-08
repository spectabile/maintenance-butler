import * as vscode from 'vscode';
import { detectInstalls } from './paths';
import { scanAll } from './scanner';
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

  const items = cleanable.map(r => {
    const isEnabled: boolean = config.get(r.target.configKey, r.target.defaultEnabled);
    const riskIcon = r.target.risk === 'permanent' ? '$(warning) ' : '$(pass) ';
    const installPrefix = multiInstall ? `[${r.install.name}] ` : '';
    return {
      label: `${riskIcon}${installPrefix}${r.target.label}`,
      description: formatBytes(r.sizeBytes) + (r.itemCount > 1 ? ` · ${r.itemCount} items` : ''),
      detail: r.target.risk === 'permanent' ? `⚠️ ${r.target.warning}` : r.target.detail,
      picked: isEnabled,
      scanResult: r,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: `Maintenance Butler — ${formatBytes(totalBytes)} available`,
    placeHolder: 'Select items to clean  (Space = toggle, Enter = confirm)',
  });

  if (!selected || selected.length === 0) return;

  // Warn before permanent deletions
  const permanent = selected.filter(s => s.scanResult.target.risk === 'permanent');
  if (permanent.length > 0) {
    const lines = permanent.map(s => `• ${s.scanResult.target.label}: ${s.scanResult.target.warning}`).join('\n');
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
    const total = selected.reduce((sum, s) => sum + s.scanResult.sizeBytes, 0);
    vscode.window.showInformationMessage(
      `Maintenance Butler (dry run): would free ${formatBytes(total)} across ${selected.length} item(s).`
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
      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        progress.report({
          message: item.scanResult.target.label,
          increment: 100 / selected.length,
        });
        const result = await cleanTarget(item.scanResult, { historyMaxAgeDays });
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
