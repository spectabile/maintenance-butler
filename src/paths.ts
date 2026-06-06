import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { VSCodeInstall } from './types';

export function detectInstalls(): VSCodeInstall[] {
  const config = vscode.workspace.getConfiguration('vscodeJanitor');
  const portableOverride: string = config.get('portableDataPath', '');
  const includeInsiders: boolean = config.get('includeInsiders', false);
  const installs: VSCodeInstall[] = [];

  // Portable: env var set by VS Code itself when running in portable mode, or user override
  const portableData = process.env['VSCODE_PORTABLE'] || portableOverride.trim() || undefined;
  if (portableData && fs.existsSync(portableData)) {
    const udPath = path.join(portableData, 'user-data');
    const extPath = path.join(portableData, 'extensions');
    if (fs.existsSync(udPath)) {
      installs.push({ name: 'Portable', userDataPath: udPath, extensionsPath: extPath });
    }
  }

  // Standard install
  const standard = getInstallPaths('Code');
  if (standard && fs.existsSync(standard.userDataPath)) {
    if (!installs.some(i => samePath(i.userDataPath, standard.userDataPath))) {
      installs.push({ name: 'Standard', ...standard });
    }
  }

  // Insiders
  if (includeInsiders) {
    const insiders = getInstallPaths('Code - Insiders');
    if (insiders && fs.existsSync(insiders.userDataPath)) {
      installs.push({ name: 'Insiders', ...insiders });
    }
  }

  return installs;
}

function getInstallPaths(appName: string): { userDataPath: string; extensionsPath: string } | null {
  const home = os.homedir();
  const isInsiders = appName === 'Code - Insiders';
  const extFolder = isInsiders ? '.vscode-insiders' : '.vscode';

  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'];
    const userProfile = process.env['USERPROFILE'] || home;
    if (!appData) return null;
    return {
      userDataPath: path.join(appData, appName),
      extensionsPath: path.join(userProfile, extFolder, 'extensions'),
    };
  }

  if (process.platform === 'darwin') {
    return {
      userDataPath: path.join(home, 'Library', 'Application Support', appName),
      extensionsPath: path.join(home, extFolder, 'extensions'),
    };
  }

  // Linux
  return {
    userDataPath: path.join(home, '.config', appName),
    extensionsPath: path.join(home, extFolder, 'extensions'),
  };
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}
