const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nodex", {
  scan: (onProgress) => {
    const listener = (_event, progress) => onProgress?.(progress);
    ipcRenderer.on("signals:scan-progress", listener);
    return ipcRenderer.invoke("signals:scan").finally(() => {
      ipcRenderer.removeListener("signals:scan-progress", listener);
    });
  },
  performAction: (input) => ipcRenderer.invoke("records:action", input),
  setTheme: (theme) => ipcRenderer.invoke("theme:set", theme),
  p2p: {
    getSettings: () => ipcRenderer.invoke("p2p:getSettings"),
    setScope: (networkId, scope) => ipcRenderer.invoke("p2p:setScope", networkId, scope)
  }
});
