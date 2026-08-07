const { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { GachaHistoryService } = require("./gacha-history");

let mainWindow = null;
let overlayWindow = null;
let overlayInteractive = true;
let gachaHistoryService = null;
const OVERLAY_WIDTH = 390;
const OVERLAY_MIN_HEIGHT = 392;
const OVERLAY_MAX_HEIGHT = 720;
const MAIN_MIN_WIDTH = 900;

function hardenWindow(window) {
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

function runtimeAssetPath(...segments) {
  if (!app.isPackaged) return path.join(__dirname, "..", ...segments);
  return path.join(process.resourcesPath, "app.asar.unpacked", ...segments);
}

function findLanguageDataDirectory(language) {
  const languageRoot = runtimeAssetPath("node_modules", "@tesseract.js-data", language);
  const directories = fs.readdirSync(languageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  const preferredDirectory = directories.find((name) => name.endsWith("_best_int")) || directories[0];

  if (!preferredDirectory) {
    throw new Error(`No Tesseract language data directory found for ${language}.`);
  }
  return path.join(languageRoot, preferredDirectory);
}

function broadcastOverlayInteractionState(message) {
  const payload = {
    command: "overlay-interactive-changed",
    payload: {
      interactive: overlayInteractive,
      message
    }
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("overlay:command", payload);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:update", {
      interactive: overlayInteractive,
      message
    });
  }
}

function setOverlayInteractive(interactive, message) {
  const overlay = createOverlayWindow();
  overlayInteractive = Boolean(interactive);
  overlay.setFocusable(overlayInteractive);
  overlay.setIgnoreMouseEvents(!overlayInteractive);
  if (overlayInteractive) overlay.focus();
  broadcastOverlayInteractionState(message);
  return overlayInteractive;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: MAIN_MIN_WIDTH,
    minHeight: 640,
    backgroundColor: "#eef3f1",
    title: "鸣潮资源规划",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  hardenWindow(mainWindow);
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (overlayWindow) {
      overlayWindow.close();
      overlayWindow = null;
    }
  });
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const primaryDisplay = screen.getPrimaryDisplay();
  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: 520,
    x: primaryDisplay.workArea.x + primaryDisplay.workArea.width - (OVERLAY_WIDTH + 26),
    y: primaryDisplay.workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: overlayInteractive,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(!overlayInteractive);
  hardenWindow(overlayWindow);
  overlayWindow.loadFile(path.join(__dirname, "..", "overlay.html"));
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

app.whenReady().then(() => {
  gachaHistoryService = new GachaHistoryService(app.getPath("appData"));
  createMainWindow();
  const shortcutRegistered = globalShortcut.register("CommandOrControl+Shift+O", () => {
    setOverlayInteractive(!overlayInteractive, overlayInteractive
      ? "浮窗已穿透；可按 Ctrl+Shift+O 或在主窗口恢复操作。"
      : "浮窗已恢复可操作。");
  });

  if (!shortcutRegistered) {
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "快捷键不可用",
      message: "Ctrl+Shift+O 已被其他程序占用。请通过主界面的浮窗控制切换鼠标穿透状态。"
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle("capture:list-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    displayId: source.display_id,
    thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null
  }));
});

ipcMain.handle("ocr:get-config", () => {
  const toUrl = (...segments) => pathToFileURL(runtimeAssetPath(...segments)).toString();
  return {
    workerPath: toUrl("node_modules", "tesseract.js", "dist", "worker.min.js"),
    corePath: toUrl("node_modules", "tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"),
    langPath: pathToFileURL(findLanguageDataDirectory("chi_sim")).toString()
  };
});

ipcMain.handle("history:choose-game-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  gachaHistoryService?.setGameRoot(result.filePaths[0]);
  return { ok: true, gameRoot: result.filePaths[0] };
});

ipcMain.handle("history:connect", async (_event, banner) => {
  if (!gachaHistoryService) return { ok: false, status: "unavailable", error: "History service is not ready." };
  try {
    return await gachaHistoryService.connect(banner);
  } catch (error) {
    return { ok: false, status: "error", error: "Unable to update local gacha history right now." };
  }
});

ipcMain.handle("overlay:show", () => {
  const overlay = createOverlayWindow();
  overlay.showInactive();
  broadcastOverlayInteractionState(overlayInteractive
    ? "浮窗可操作；点击“切换至鼠标穿透”后可按 Ctrl+Shift+O 恢复。"
    : "浮窗已穿透；可按 Ctrl+Shift+O 或在主窗口恢复操作。");
  return true;
});

ipcMain.handle("overlay:hide", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  return true;
});

ipcMain.handle("overlay:update", (_event, payload) => {
  const overlay = createOverlayWindow();
  overlay.webContents.send("overlay:update", payload || {});
  if (!overlay.isVisible()) overlay.showInactive();
  return true;
});

ipcMain.handle("overlay:resize", (_event, height) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  const currentBounds = overlayWindow.getBounds();
  const workArea = screen.getDisplayMatching(currentBounds).workArea;
  const maximumHeight = Math.max(OVERLAY_MIN_HEIGHT, Math.min(OVERLAY_MAX_HEIGHT, workArea.height));
  const nextHeight = Math.max(
    OVERLAY_MIN_HEIGHT,
    Math.min(maximumHeight, Math.round(Number(height) || OVERLAY_MIN_HEIGHT))
  );
  const nextX = Math.max(workArea.x, Math.min(currentBounds.x, workArea.x + workArea.width - OVERLAY_WIDTH));
  const nextY = Math.max(workArea.y, Math.min(currentBounds.y, workArea.y + workArea.height - nextHeight));
  overlayWindow.setBounds({ x: nextX, y: nextY, width: OVERLAY_WIDTH, height: nextHeight });
  return nextHeight;
});

ipcMain.handle("overlay:interactive", (_event, interactive) => {
  return setOverlayInteractive(interactive, interactive
    ? "浮窗已恢复可操作。"
    : "浮窗已穿透；可按 Ctrl+Shift+O 或在主窗口恢复操作。");
});

ipcMain.on("overlay:command", (_event, command) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("overlay:command", command);
  }
});
