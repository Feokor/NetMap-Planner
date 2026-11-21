const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibe', {
  platform: 'desktop',
  version: ipcRenderer.sendSync('app:version'),
  get: (key) => ipcRenderer.invoke('storage:get', key),
  set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
  remove: (key) => ipcRenderer.invoke('storage:remove', key),
  info: () => ipcRenderer.invoke('app:info'),
  saveFile: (options) => ipcRenderer.invoke('file:save', options),
  openFile: (options) => ipcRenderer.invoke('file:open', options),
});
