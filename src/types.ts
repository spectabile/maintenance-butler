export interface VSCodeInstall {
  name: string;
  userDataPath: string;
  extensionsPath: string;
}

export type RiskLevel = 'safe' | 'permanent';

export type CleanMode =
  | 'directory'
  | 'duplicate-extensions'
  | 'obsolete'
  | 'orphaned-workspace-storage'
  | 'workspace-storage-picker'
  | 'history-age';

export interface WorkspaceEntry {
  storagePath: string;
  projectPath: string;
  isOrphaned: boolean;
  sizeBytes: number;
}

export interface TargetDef {
  id: string;
  configKey: string;
  label: string;
  detail: string;
  risk: RiskLevel;
  warning?: string;
  defaultEnabled: boolean;
  cleanMode: CleanMode;
  getPaths(install: VSCodeInstall): string[];
}

export interface ScanResult {
  target: TargetDef;
  install: VSCodeInstall;
  paths: string[];
  sizeBytes: number;
  itemCount: number;
  workspaceEntries?: WorkspaceEntry[];
}

export interface CleanResult {
  bytesFreed: number;
  itemsDeleted: number;
  errors: string[];
}
