import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { VSCodeInstall, TargetDef, ScanResult, WorkspaceEntry } from './types';
import { TARGETS } from './targets';

export async function scanAll(installs: VSCodeInstall[]): Promise<ScanResult[]> {
  const config = vscode.workspace.getConfiguration('maintenanceButler');
  const results: ScanResult[] = [];

  for (const install of installs) {
    for (const target of TARGETS) {
      const existingPaths = target.getPaths(install).filter(p => fsSync.existsSync(p));
      if (existingPaths.length === 0) continue;

      let sizeBytes = 0;
      let itemCount = 0;
      let workspaceEntries: WorkspaceEntry[] | undefined;

      try {
        if (target.cleanMode === 'directory') {
          for (const p of existingPaths) {
            sizeBytes += await getDirSize(p);
          }
          itemCount = sizeBytes > 0 ? 1 : 0;
        } else if (target.cleanMode === 'duplicate-extensions') {
          const result = await scanDuplicateExtensions(existingPaths[0]);
          sizeBytes = result.sizeBytes;
          itemCount = result.count;
        } else if (target.cleanMode === 'obsolete') {
          const result = await scanObsolete(existingPaths[0]);
          sizeBytes = result.sizeBytes;
          itemCount = result.count;
        } else if (target.cleanMode === 'orphaned-workspace-storage') {
          const currentPaths = getOpenWorkspacePaths();
          const entries = await findAllWorkspaceEntries(existingPaths[0], currentPaths);
          const orphaned = entries.filter(e => e.isOrphaned);
          for (const e of orphaned) sizeBytes += e.sizeBytes;
          itemCount = orphaned.length;
          workspaceEntries = orphaned;
        } else if (target.cleanMode === 'workspace-storage-picker') {
          const currentPaths = getOpenWorkspacePaths();
          const entries = await findAllWorkspaceEntries(existingPaths[0], currentPaths);
          const active = entries.filter(e => !e.isOrphaned);
          for (const e of active) sizeBytes += e.sizeBytes;
          itemCount = active.length;
          workspaceEntries = active;
        } else if (target.cleanMode === 'history-age') {
          const maxAgeDays: number = config.get('historyMaxAgeDays', 30);
          const old = await findOldHistoryFolders(existingPaths[0], maxAgeDays);
          for (const p of old) sizeBytes += await getDirSize(p);
          itemCount = old.length;
        }
      } catch {
        continue;
      }

      results.push({ target, install, paths: existingPaths, sizeBytes, itemCount, workspaceEntries });
    }
  }

  return results;
}

// --- Directory size ---

export async function getDirSize(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return getDirSize(entryPath);
        }
        const stat = await fs.stat(entryPath).catch(() => null);
        return stat ? stat.size : 0;
      })
    );
    return sizes.reduce((sum, n) => sum + n, 0);
  } catch {
    return 0;
  }
}

// --- Duplicate extensions ---

export interface ExtensionVersion {
  folderName: string;
  publisher: string;
  name: string;
  version: string;
  platform: string;
}

export async function groupExtensionsByName(
  extensionsPath: string
): Promise<Map<string, ExtensionVersion[]>> {
  const groups = new Map<string, ExtensionVersion[]>();
  try {
    const entries = await fs.readdir(extensionsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const parsed = parseExtensionFolderName(entry.name);
      if (!parsed) continue;
      const key = `${parsed.publisher}.${parsed.name}@${parsed.platform}`;
      const group = groups.get(key) ?? [];
      group.push(parsed);
      groups.set(key, group);
    }
  } catch {
    // ignore
  }
  return groups;
}

export async function scanDuplicateExtensions(
  extensionsPath: string
): Promise<{ sizeBytes: number; count: number }> {
  const groups = await groupExtensionsByName(extensionsPath);
  let sizeBytes = 0;
  let count = 0;
  for (const versions of groups.values()) {
    if (versions.length <= 1) continue;
    versions.sort((a, b) => compareVersions(b.version, a.version));
    for (const old of versions.slice(1)) {
      sizeBytes += await getDirSize(path.join(extensionsPath, old.folderName));
      count++;
    }
  }
  return { sizeBytes, count };
}

// --- Obsolete extensions ---

async function scanObsolete(
  extensionsPath: string
): Promise<{ sizeBytes: number; count: number }> {
  const obsoleteFile = path.join(extensionsPath, '.obsolete');
  try {
    const content = await fs.readFile(obsoleteFile, 'utf8');
    const obsolete: Record<string, boolean> = JSON.parse(content);
    let sizeBytes = 0;
    let count = 0;
    for (const [folderName, shouldRemove] of Object.entries(obsolete)) {
      if (!shouldRemove) continue;
      const folderPath = path.join(extensionsPath, folderName);
      if (fsSync.existsSync(folderPath)) {
        sizeBytes += await getDirSize(folderPath);
        count++;
      }
    }
    return { sizeBytes, count };
  } catch {
    return { sizeBytes: 0, count: 0 };
  }
}

// --- Orphaned workspace storage ---

export async function findOrphanedWorkspaceFolders(storagePath: string): Promise<string[]> {
  const orphans: string[] = [];
  try {
    const entries = await fs.readdir(storagePath, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory()) return;
        const entryPath = path.join(storagePath, entry.name);
        const workspaceJson = path.join(entryPath, 'workspace.json');
        try {
          const content = await fs.readFile(workspaceJson, 'utf8');
          const data: Record<string, string> = JSON.parse(content);
          const rawUri = data['folder'] ?? data['configuration'] ?? data['workspace'];
          if (!rawUri) return;

          // Convert file URI to filesystem path
          const normalized = uriToPath(rawUri);
          if (normalized && !fsSync.existsSync(normalized)) {
            orphans.push(entryPath);
          }
        } catch {
          // Unreadable or missing workspace.json — skip to avoid false positives
        }
      })
    );
  } catch {
    // ignore
  }
  return orphans;
}

// --- All workspace entries (for picker) ---

function getOpenWorkspacePaths(): string[] {
  const paths: string[] = [];
  vscode.workspace.workspaceFolders?.forEach(f => paths.push(f.uri.fsPath.toLowerCase()));
  if (vscode.workspace.workspaceFile) paths.push(vscode.workspace.workspaceFile.fsPath.toLowerCase());
  return paths;
}

export async function findAllWorkspaceEntries(
  storagePath: string,
  excludePaths: string[] = []
): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = [];
  try {
    const dirs = await fs.readdir(storagePath, { withFileTypes: true });
    await Promise.all(
      dirs.map(async (dir) => {
        if (!dir.isDirectory()) return;
        const entryPath = path.join(storagePath, dir.name);
        const workspaceJson = path.join(entryPath, 'workspace.json');
        try {
          const content = await fs.readFile(workspaceJson, 'utf8');
          const data: Record<string, string> = JSON.parse(content);
          const rawUri = data['folder'] ?? data['configuration'] ?? data['workspace'];
          if (!rawUri) return;
          const projectPath = uriToPath(rawUri);
          if (!projectPath) return;
          if (excludePaths.includes(projectPath.toLowerCase())) return;
          const isOrphaned = !fsSync.existsSync(projectPath);
          const sizeBytes = await getDirSize(entryPath);
          entries.push({ storagePath: entryPath, projectPath, isOrphaned, sizeBytes });
        } catch {
          // Unreadable workspace.json — skip
        }
      })
    );
  } catch {
    // ignore
  }
  return entries;
}

// --- Old history folders ---

export async function findOldHistoryFolders(
  historyPath: string,
  maxAgeDays: number
): Promise<string[]> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const old: string[] = [];
  try {
    const topEntries = await fs.readdir(historyPath, { withFileTypes: true });
    for (const top of topEntries) {
      if (!top.isDirectory()) continue;
      const topPath = path.join(historyPath, top.name);
      const subEntries = await fs.readdir(topPath, { withFileTypes: true }).catch(() => []);
      if (subEntries.length === 0) continue;

      let allOld = true;
      for (const sub of subEntries) {
        const stat = await fs.stat(path.join(topPath, sub.name)).catch(() => null);
        if (stat && stat.mtimeMs > cutoff) {
          allOld = false;
          break;
        }
      }
      if (allOld) old.push(topPath);
    }
  } catch {
    // ignore
  }
  return old;
}

// --- Helpers ---

function parseExtensionFolderName(folderName: string): ExtensionVersion | null {
  // Matches: publisher.name-1.2.3  or  publisher.name-1.2.3-win32-x64
  const match = folderName.match(
    /^(.+?)-(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)(?:-([a-zA-Z0-9]+-[a-zA-Z0-9]+))?$/
  );
  if (!match) return null;
  const fullName = match[1];
  const dotIndex = fullName.indexOf('.');
  if (dotIndex === -1) return null;
  return {
    folderName,
    publisher: fullName.substring(0, dotIndex),
    name: fullName.substring(dotIndex + 1),
    version: match[2],
    platform: match[3] ?? '',
  };
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split('-')[0].split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function uriToPath(uri: string): string | null {
  try {
    // Handles file:///C:/... (Windows) and file:///home/... (Linux/Mac)
    const url = new URL(uri);
    if (url.protocol !== 'file:') return null;
    let p = decodeURIComponent(url.pathname);
    // On Windows, URL pathname starts with /C:/ — strip leading slash
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(p)) {
      p = p.substring(1);
    }
    return p;
  } catch {
    return null;
  }
}
