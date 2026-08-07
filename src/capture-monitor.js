(function attachCaptureMonitor() {
  "use strict";

  const desktop = window.WuwaDesktop;
  const recognition = window.WuwaRecognition;
  const planner = window.WuwaPlannerApp;
  const elements = {
    panel: document.getElementById("captureMonitorPanel"),
    source: document.getElementById("captureSource"),
    refreshSources: document.getElementById("refreshCaptureSources"),
    banner: document.getElementById("captureBanner"),
    start: document.getElementById("startCaptureMonitor"),
    overlay: document.getElementById("toggleOverlay"),
    overlayInteraction: document.getElementById("toggleOverlayInteraction"),
    overlayInteractionControl: document.getElementById("overlayInteractionControl"),
    overlayControls: document.getElementById("captureOverlayControls"),
    historyConnect: document.getElementById("connectGachaHistory"),
    historyChooseDirectory: document.getElementById("chooseGameDirectory"),
    historyStatus: document.getElementById("historySyncStatus"),
    status: document.getElementById("captureStatus"),
    resultText: document.getElementById("captureResultText"),
    pending: document.getElementById("capturePending"),
    pendingText: document.getElementById("capturePendingText"),
    confirmUp: document.getElementById("confirmPendingUp"),
    confirmOff: document.getElementById("confirmPendingOff"),
    reject: document.getElementById("rejectPendingRecord")
  };

  if (!elements.panel) return;

  let stream = null;
  let video = null;
  let canvas = null;
  let timer = null;
  let historyTimer = null;
  let isRunning = false;
  let isPaused = false;
  let isOcrBusy = false;
  let lastResultText = "";
  let lastResultAt = 0;
  let pendingDetection = null;
  let lastAppliedSignature = "";
  let overlayVisible = false;
  let overlayInteractive = true;
  let ocrConfig = null;
  let lastScene = "unknown";
  let resultSequence = 0;
  let historyFingerprint = "";
  let historyBaselineEstablished = false;

  function isLikelyGameSource(sourceName) {
    return /鸣潮|Wuthering|Client-Win64|KR/i.test(String(sourceName || ""));
  }

  function setStatus(message, tone = "idle") {
    elements.status.textContent = message;
    elements.panel.dataset.monitorState = tone;
    updateOverlay(message);
  }

  function updateMonitorControls() {
    if (!desktop || !recognition || !planner) return;
    elements.start.textContent = isRunning ? "停止监控" : "启动监控";
    elements.start.className = isRunning ? "secondary-button" : "primary-button";
    elements.source.disabled = isRunning;
    elements.banner.disabled = Boolean(pendingDetection);
    elements.refreshSources.disabled = isRunning;
    elements.historyConnect.disabled = !planner?.hasActiveSession?.();
    elements.overlayControls.hidden = !isRunning && !overlayVisible;
    elements.overlay.hidden = overlayVisible;
    elements.overlayInteractionControl.hidden = !overlayVisible;
  }

  function formatOverlaySnapshot(message) {
    const snapshot = planner?.getOverlaySnapshot?.() || {};
    return {
      status: isRunning ? (isPaused ? "已暂停" : "监控中") : "待启动",
      message,
      banner: elements.banner.value,
      bannerDisabled: Boolean(pendingDetection),
      pendingRecordText: pendingDetection ? recognition.describeRecord(pendingDetection.record) : "",
      ...snapshot
    };
  }

  function updateOverlay(message) {
    if (!desktop || !overlayVisible) return;
    desktop.updateOverlay({
      ...formatOverlaySnapshot(message),
      interactive: overlayInteractive
    }).catch(() => {});
  }

  function requireDesktop() {
    if (desktop && recognition && planner) return true;
    elements.source.disabled = true;
    elements.refreshSources.disabled = true;
    elements.start.disabled = true;
    elements.overlay.disabled = true;
    elements.overlayInteraction.disabled = true;
    elements.historyConnect.disabled = true;
    elements.historyChooseDirectory.disabled = true;
    setStatus("自动捕捉仅在 Electron 桌面版中可用。", "error");
    return false;
  }

  async function setOverlayInteraction(interactive, message) {
    if (!desktop) return;
    overlayInteractive = Boolean(await desktop.setOverlayInteractive(interactive));
    elements.overlayInteraction.checked = !overlayInteractive;
    updateOverlay(message || (overlayInteractive ? "已切换至可操作浮窗。" : "已切换至鼠标穿透。"));
  }

  async function refreshSources() {
    if (!requireDesktop()) return;
    elements.source.innerHTML = "";
    const sources = await desktop.listCaptureSources();
    const likelyGame = sources.find((source) => isLikelyGameSource(source.name));
    for (const source of sources) {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.name;
      option.dataset.gameSource = isLikelyGameSource(source.name) ? "true" : "false";
      elements.source.appendChild(option);
    }
    if (likelyGame) elements.source.value = likelyGame.id;
    setStatus(sources.length > 0 ? "请选择鸣潮窗口后启动监控。" : "未发现可捕捉窗口。", sources.length > 0 ? "idle" : "error");
  }

  async function getOcrConfig() {
    if (ocrConfig) return ocrConfig;
    ocrConfig = await desktop.getOcrConfig();
    return ocrConfig;
  }

  async function createStream(sourceId) {
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          minWidth: 960,
          maxWidth: 2560,
          minHeight: 540,
          maxHeight: 1440
        }
      }
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  function ensureCanvas() {
    if (!video) return null;
    if (!canvas) canvas = document.createElement("canvas");
    const width = Math.min(1280, video.videoWidth || 1280);
    const height = Math.round(width * ((video.videoHeight || 720) / (video.videoWidth || 1280)));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    return canvas;
  }

  async function recognizeCanvas(targetCanvas) {
    if (!window.Tesseract) {
      return { text: "", confidence: 0, error: "OCR 运行库未加载。" };
    }
    const config = await getOcrConfig();
    const result = await window.Tesseract.recognize(targetCanvas, "chi_sim", {
      workerPath: config.workerPath,
      corePath: config.corePath,
      langPath: config.langPath,
      gzip: true,
      logger: () => {}
    });
    return {
      text: result?.data?.text || "",
      confidence: Number(result?.data?.confidence) || 0
    };
  }

  function signatureOf(record) {
    return [
      resultSequence,
      record.banner,
      record.upCount,
      record.offCount,
      record.lastResult || "pending"
    ].join(":");
  }

  function setHistoryStatus(message, tone = "idle") {
    if (!elements.historyStatus) return;
    elements.historyStatus.textContent = message;
    elements.historyStatus.dataset.tone = tone;
  }

  async function syncHistory({ quiet = false } = {}) {
    if (!desktop?.connectHistory || !planner?.hasActiveSession?.()) return { ok: false };
    const banner = elements.banner.value === "weapon" ? "weapon" : "character";
    if (!quiet) setHistoryStatus("正在读取本机抽卡历史…");
    const snapshot = await desktop.connectHistory(banner);
    if (!snapshot?.ok) {
      if (!quiet) setHistoryStatus(snapshot?.error || "暂时无法读取抽卡历史。请在游戏内打开对应池子的历史页面后重试。", "error");
      return snapshot || { ok: false };
    }
    const changed = historyBaselineEstablished && snapshot.fingerprint && snapshot.fingerprint !== historyFingerprint;
    historyFingerprint = snapshot.fingerprint || historyFingerprint;
    historyBaselineEstablished = true;
    const applied = planner.applyHistorySnapshot({ ...snapshot, historyUpdated: Boolean(changed) });
    if (applied.ok) {
      const message = changed
        ? "历史已更新：精确垫抽与小保底已校正。"
        : "已同步本机历史：当前保底状态已确认。";
      setHistoryStatus(message, "success");
      if (!quiet) setStatus(message, "success");
    }
    return snapshot;
  }

  function showPending(detection) {
    pendingDetection = detection;
    elements.pending.hidden = false;
    elements.pendingText.textContent = recognition.describeRecord(detection.record);
    updateMonitorControls();
    setOverlayInteraction(true, "识别到混合多金，请确认最后一个五星类型。");
    setStatus("识别到混合多金，请确认最后一个五星类型。", "pending");
  }

  function clearPending() {
    pendingDetection = null;
    elements.pending.hidden = true;
    elements.pendingText.textContent = "--";
    updateMonitorControls();
    updateOverlay("继续监控中。");
  }

  function applyDetectedRecord(detection) {
    const record = detection.record;
    const signature = signatureOf(record);
    if (signature === lastAppliedSignature) {
      setStatus("已忽略重复识别结果。", "idle");
      return;
    }
    const result = planner.applyObservedRecord(record, {
      source: "capture",
      confidence: detection.confidence,
      names: detection.names || []
    });
    if (!result.ok) {
      setStatus(result.error || "识别结果未通过规划校验。", "error");
      return;
    }
    lastAppliedSignature = signature;
    lastResultText = "";
    lastResultAt = 0;
    setStatus(result.estimated
      ? "已记录五星结果，正在等待抽卡历史更新以校正保底。"
      : "已记录无五星十连，垫抽已精确累计。", "success");
    if (result.estimated) {
      window.setTimeout(() => syncHistory({ quiet: true }).catch(() => {}), 1200);
    }
  }

  function tryBuildRecord(ocrText, scene) {
    const banner = elements.banner.value;
    if (scene === "result") {
      lastResultText = ocrText;
      lastResultAt = Date.now();
      resultSequence += 1;
      elements.resultText.textContent = ocrText.trim() || "识别到结果画面，但 OCR 未读取到文字。";
      const observation = recognition.buildObservedRecord({ banner, resultText: lastResultText });
      if (!observation.ok) {
        setStatus(observation.error || "无法解析本次十连结果。", "error");
        return;
      }
      if (observation.needsConfirmation) showPending(observation);
      else applyDetectedRecord(observation);
      return;
    }
  }

  async function tick() {
    if (!isRunning || isPaused || isOcrBusy || pendingDetection) return;
    const targetCanvas = ensureCanvas();
    if (!targetCanvas) return;

    isOcrBusy = true;
    try {
      const result = await recognizeCanvas(targetCanvas);
      const scene = recognition.detectScene(result.text);
      if (scene === "unknown") {
        setStatus("未识别到抽卡结果或保底画面。", "idle");
      } else if (scene === "result" && lastScene !== "result") {
        tryBuildRecord(result.text, scene);
      }
      lastScene = scene;
    } catch (error) {
      setStatus(`OCR 识别失败：${error.message || error}`, "error");
    } finally {
      isOcrBusy = false;
    }
  }

  async function startMonitor() {
    if (!requireDesktop()) return;
    if (!planner.hasActiveSession()) {
      setStatus("请先在基础数据中计算并开启本轮规划。", "error");
      return;
    }
    if (!elements.source.value) {
      setStatus("请先选择要捕捉的鸣潮窗口。", "error");
      return;
    }
    const selectedSource = elements.source.selectedOptions[0];
    if (selectedSource?.dataset.gameSource !== "true") {
      setStatus("请从列表中选择名称为鸣潮、Wuthering 或 Client-Win64 的游戏窗口。", "error");
      return;
    }

    stopMonitor();
    planner.setCurrentBanner(elements.banner.value);
    stream = await createStream(elements.source.value);
    video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    isRunning = true;
    isPaused = false;
    lastScene = "unknown";
    updateMonitorControls();
    timer = window.setInterval(tick, 2600);
    historyTimer = window.setInterval(() => syncHistory({ quiet: true }).catch(() => {}), 15000);
    await desktop.showOverlay();
    overlayVisible = true;
    updateMonitorControls();
    await setOverlayInteraction(true, "浮窗已显示，可直接操作。");
    syncHistory({ quiet: true }).catch(() => {});
    setStatus("监控已启动：结果页用于记录十连，抽卡历史更新后会自动校正保底。", "success");
  }

  function stopMonitor() {
    if (timer) window.clearInterval(timer);
    timer = null;
    if (historyTimer) window.clearInterval(historyTimer);
    historyTimer = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    stream = null;
    video = null;
    canvas = null;
    isRunning = false;
    isPaused = false;
    isOcrBusy = false;
    updateMonitorControls();
    clearPending();
    setStatus("监控已停止。", "idle");
  }

  function confirmPending(lastResult) {
    if (!pendingDetection) return;
    pendingDetection.record.lastResult = lastResult === "off" ? "off" : "up";
    applyDetectedRecord(pendingDetection);
    clearPending();
  }

  elements.refreshSources.addEventListener("click", refreshSources);
  elements.historyConnect?.addEventListener("click", () => {
    syncHistory().catch(() => setHistoryStatus("读取抽卡历史时发生错误。", "error"));
  });
  elements.historyChooseDirectory?.addEventListener("click", async () => {
    const result = await desktop?.chooseGameDirectory?.();
    if (result?.ok) setHistoryStatus("已选择游戏目录。请打开游戏内对应池子的抽卡历史后连接同步。", "success");
  });
  elements.start.addEventListener("click", () => {
    if (isRunning) {
      stopMonitor();
      return;
    }
    startMonitor().catch((error) => setStatus(`启动失败：${error.message || error}`, "error"));
  });
  elements.overlay.addEventListener("click", async () => {
    overlayVisible = !overlayVisible;
    if (overlayVisible) await desktop?.showOverlay();
    else await desktop?.hideOverlay();
    elements.overlay.textContent = overlayVisible ? "隐藏浮窗" : "显示浮窗";
    updateMonitorControls();
    updateOverlay("浮窗状态已更新。");
  });
  elements.overlayInteraction.addEventListener("click", () => {
    setOverlayInteraction(!elements.overlayInteraction.checked, elements.overlayInteraction.checked
      ? "已切换至鼠标穿透。"
      : "已切换至可操作浮窗。");
  });
  elements.banner.addEventListener("change", () => {
    historyFingerprint = "";
    historyBaselineEstablished = false;
    planner?.setCurrentBanner(elements.banner.value);
    updateOverlay(`已切换至${elements.banner.value === "weapon" ? "限定武器池" : "限定角色池"}。`);
  });
  elements.confirmUp.addEventListener("click", () => confirmPending("up"));
  elements.confirmOff.addEventListener("click", () => confirmPending("off"));
  elements.reject.addEventListener("click", () => {
    clearPending();
    setStatus("已放弃本次识别结果。", "idle");
  });

  desktop?.onOverlayCommand((payload) => {
    if (!payload) return;
    if (payload.command === "confirm-pending") confirmPending(payload.payload?.lastResult);
    if (payload.command === "reject-pending") {
      clearPending();
      setStatus("已放弃本次识别结果。", "idle");
    }
    if (payload.command === "pause-monitor") {
      isPaused = true;
      setStatus("监控已暂停。", "idle");
    }
    if (payload.command === "resume-monitor") {
      isPaused = false;
      setStatus("监控已继续。", "success");
    }
    if (payload.command === "hide-overlay") {
      overlayVisible = false;
      elements.overlay.textContent = "显示浮窗";
      updateMonitorControls();
      setStatus("浮窗已隐藏。", "idle");
    }
    if (payload.command === "set-banner") {
      if (pendingDetection) {
        setStatus("请先确认或放弃当前识别结果。", "pending");
        return;
      }
      const banner = payload.payload?.banner === "weapon" ? "weapon" : "character";
      elements.banner.value = banner;
      historyFingerprint = "";
      historyBaselineEstablished = false;
      planner?.setCurrentBanner(banner);
      setStatus(`已切换至${banner === "weapon" ? "限定武器池" : "限定角色池"}。`, "idle");
    }
    if (payload.command === "overlay-interactive-changed") {
      overlayInteractive = Boolean(payload.payload?.interactive);
      elements.overlayInteraction.checked = !overlayInteractive;
      updateOverlay(payload.payload?.message || "浮窗交互状态已更新。");
    }
  });

  document.addEventListener("wuwa:planner-state", () => {
    updateMonitorControls();
    updateOverlay("规划状态已刷新。");
  });
  requireDesktop();
  updateMonitorControls();
  refreshSources().catch((error) => setStatus(`窗口列表读取失败：${error.message || error}`, "error"));
})();
