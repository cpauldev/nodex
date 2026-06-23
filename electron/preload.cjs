const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nodex", {
  scan: (onProgress, targetCollectorIds) => {
    const listener = (_event, progress) => onProgress?.(progress);
    ipcRenderer.on("signals:scan-progress", listener);
    return ipcRenderer.invoke("signals:scan", targetCollectorIds).finally(() => {
      ipcRenderer.removeListener("signals:scan-progress", listener);
    });
  },
  onRecordUpdate: (callback) => {
    const listener = (_event, record) => callback(record);
    ipcRenderer.on("records:update", listener);
    return () => {
      ipcRenderer.removeListener("records:update", listener);
    };
  },
  performAction: (input) => ipcRenderer.invoke("records:action", input),
  setTheme: (theme) => ipcRenderer.invoke("theme:set", theme),
  p2p: {
    getSettings: () => ipcRenderer.invoke("p2p:getSettings"),
    setScope: (networkId, scope) => ipcRenderer.invoke("p2p:setScope", networkId, scope)
  },
  radio: {
    getSettings: () => ipcRenderer.invoke("radio:getSettings"),
    setDirectoryLimit: (limit) => ipcRenderer.invoke("radio:setDirectoryLimit", limit),
    setPage: (page) => ipcRenderer.invoke("radio:setPage", page),
    setFilters: (filters) => ipcRenderer.invoke("radio:setFilters", filters)
  }
});
