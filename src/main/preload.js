'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hailu', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (data) => ipcRenderer.invoke('config:set', data),

  launchApp: (id) => ipcRenderer.invoke('launch:app', id),
  launchProfile: (id) => ipcRenderer.invoke('launch:profile', id),
  launchMany: (payload) => ipcRenderer.invoke('launch:many', payload),

  scanInstalled: (force) => ipcRenderer.invoke('apps:scan', force),
  fileIcon: (p) => ipcRenderer.invoke('apps:fileIcon', p),

  pickExe: () => ipcRenderer.invoke('dialog:pickExe'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),

  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),

  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  close: () => ipcRenderer.invoke('win:close'),
  version: () => ipcRenderer.invoke('app:version'),

  onProfileLaunched: (cb) =>
    ipcRenderer.on('profile-launched', (_e, data) => cb(data)),
});
