const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kopiaApi", {
  selectDirectory: async (opts) => ipcRenderer.invoke("select-directory", opts),
  scanDirectory: async (dirPath, options) => ipcRenderer.invoke("scan-directory", dirPath, options),
  writeFile: async (destRoot, relPath, sourceFullPath) => ipcRenderer.invoke("write-file", destRoot, relPath, sourceFullPath),
  listDrives: async () => ipcRenderer.invoke("list-drives")
});
