import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { VSCodeInstall } from './types';

export function detectInstalls(): VSCodeInstall[] {
  // Always return exactly the install that is currently running — never touch other installs.
  // Users run the command in each install they want to clean.

  // Portable: VS Code sets VSCODE_PORTABLE automatically when running in portable mode
  const portableData = process.env['VSCODE_PORTABLE'];
  if (portableData && fs.existsSync(portableData)) {
    const udPath = path.join(portableData, 'user-data');
    const extPath = path.join(portableData, 'extensions');
    if (fs.existsSync(udPath)) {
      return [{ name: 'Portable', userDataPath: udPath, extensionsPath: extPath }];
    }
  }

  // Standard or Insiders — detected via vscode.env.appName
  const isInsiders = vscode.env.appName.toLowerCase().includes('insiders');
  const appFolder = isInsiders ? 'Code - Insiders' : 'Code';
  const install = getInstallPaths(appFolder);
  if (install && fs.existsSync(install.userDataPath)) {
    return [{ name: isInsiders ? 'Insiders' : 'Standard', ...install }];
  }

  return [];
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
