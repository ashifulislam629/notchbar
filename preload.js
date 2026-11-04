const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('api', {
  setOpen: o => ipcRenderer.send('set-open', o),
  onOpenState: cb => ipcRenderer.on('open-state', (_e, v) => cb(v)),
  onStats: cb => ipcRenderer.on('stats', (_e, v) => cb(v)),
  onClipboard: cb => ipcRenderer.on('clipboard', (_e, v) => cb(v)),
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  copy: t => ipcRenderer.send('copy', t),
  clearClipboard: () => ipcRenderer.send('clear-clipboard'),
  pathForFile: f => webUtils.getPathForFile(f),
  openPath: p => ipcRenderer.send('open-path', p)
});
