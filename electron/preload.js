const { contextBridge, ipcRenderer } = require("electron");

const validOverlayCommands = new Set([
  "confirm-pending",
  "reject-pending",
  "pause-monitor",
  "resume-monitor",
  "toggle-interactive",
  "hide-overlay",
  "set-banner"
]);

contextBridge.exposeInMainWorld("WuwaDesktop", {
  isElectron: true,
  listCaptureSources: () => ipcRenderer.invoke("capture:list-sources"),
  getOcrConfig: () => ipcRenderer.invoke("ocr:get-config"),
  showOverlay: () => ipcRenderer.invoke("overlay:show"),
  hideOverlay: () => ipcRenderer.invoke("overlay:hide"),
  updateOverlay: (payload) => ipcRenderer.invoke("overlay:update", payload),
  resizeOverlay: (height) => ipcRenderer.invoke("overlay:resize", height),
  setOverlayInteractive: (interactive) => ipcRenderer.invoke("overlay:interactive", Boolean(interactive)),
  sendOverlayCommand: (command, payload) => {
    if (!validOverlayCommands.has(command)) return;
    ipcRenderer.send("overlay:command", { command, payload: payload || null });
  },
  onOverlayCommand: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:command", listener);
    return () => ipcRenderer.removeListener("overlay:command", listener);
  },
  onOverlayUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:update", listener);
    return () => ipcRenderer.removeListener("overlay:update", listener);
  }
});
