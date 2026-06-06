import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { ScanResult, CleanResult } from './types';
import {
  getDirSize,
  groupExtensionsByName,
  compareVersions,
  findOrphanedWorkspaceFolders,
  findOldHistoryFolders,
} from './scanner';

export interface CleanOptions {
  historyMaxAgeDays: number;
}

export async function cleanTarget(result: ScanResult, options: CleanOptions): Promise<CleanResult> {
  const outcome: CleanResult = { bytesFreed: 0, itemsDeleted: 0, errors: [] };

  for (const targetPath of result.paths) {
    if (!fsSync.existsSync(targetPath)) continue;
    try {
      switch (result.target.cleanMode) {
        case 'directory':
          outcome.bytesFreed += await getDirSize(targetPath);
          await fs.rm(targetPath, { recursive: true, force: true });
          outcome.itemsDeleted++;
          break;
        case 'duplicate-extensions':
          await cleanDuplicates(targetPath, outcome);
          break;
        case 'obsolete':
          await cleanObsolete(targetPath, outcome);
          break;
        case 'orphaned-workspace-storage':
          await cleanOrphans(targetPath, outcome);
          break;
        case 'history-age':
          await cleanHistory(targetPath, options.historyMaxAgeDays, outcome);
          break;
      }
    } catch (err) {
      outcome.errors.push(`${path.basename(targetPath)}: ${String(err)}`);
    }
  }

  return outcome;
}

async function cleanDuplicates(extensionsPath: string, outcome: CleanResult): Promise<void> {
  const groups = await groupExtensionsByName(extensionsPath);
  for (const versions of groups.values()) {
    if (versions.length <= 1) continue;
    versions.sort((a, b) => compareVersions(b.version, a.version));
    for (const old of versions.slice(1)) {
      const oldPath = path.join(extensionsPath, old.folderName);
      try {
        outcome.bytesFreed += await getDirSize(oldPath);
        await fs.rm(oldPath, { recursive: true, force: true });
        outcome.itemsDeleted++;
      } catch (err) {
        outcome.errors.push(`${old.folderName}: ${String(err)}`);
      }
    }
  }
}

async function cleanObsolete(extensionsPath: string, outcome: CleanResult): Promise<void> {
  const obsoleteFile = path.join(extensionsPath, '.obsolete');
  try {
    const content = await fs.readFile(obsoleteFile, 'utf8');
    const obsolete: Record<string, boolean> = JSON.parse(content);
    for (const [folderName, shouldRemove] of Object.entries(obsolete)) {
      if (!shouldRemove) continue;
      const folderPath = path.join(extensionsPath, folderName);
      if (fsSync.existsSync(folderPath)) {
        outcome.bytesFreed += await getDirSize(folderPath);
        await fs.rm(folderPath, { recursive: true, force: true });
        outcome.itemsDeleted++;
      }
    }
    await fs.unlink(obsoleteFile);
    outcome.itemsDeleted++;
  } catch {
    // No .obsolete file or nothing to process — not an error
  }
}

async function cleanOrphans(storagePath: string, outcome: CleanResult): Promise<void> {
  const orphans = await findOrphanedWorkspaceFolders(storagePath);
  for (const orphanPath of orphans) {
    try {
      outcome.bytesFreed += await getDirSize(orphanPath);
      await fs.rm(orphanPath, { recursive: true, force: true });
      outcome.itemsDeleted++;
    } catch (err) {
      outcome.errors.push(`${path.basename(orphanPath)}: ${String(err)}`);
    }
  }
}

async function cleanHistory(
  historyPath: string,
  maxAgeDays: number,
  outcome: CleanResult
): Promise<void> {
  const oldFolders = await findOldHistoryFolders(historyPath, maxAgeDays);
  for (const folderPath of oldFolders) {
    try {
      outcome.bytesFreed += await getDirSize(folderPath);
      await fs.rm(folderPath, { recursive: true, force: true });
      outcome.itemsDeleted++;
    } catch (err) {
      outcome.errors.push(`${path.basename(folderPath)}: ${String(err)}`);
    }
  }
}
