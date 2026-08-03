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
    const likelyGame = sources.find((source) => /鸣潮|Wuthering|Client-Win64|KR/i.test(source.name));
    for (const source of sources) {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.name;
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
      record.banner,
      record.upCount,
      record.offCount,
      record.lastResult || "pending",
      record.remainingPity
    ].join(":");
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
    const result = planner.applyDetectedRecord(record, {
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
    setStatus(`已自动记录：${recognition.describeRecord(record)}`, "success");
  }

  function tryBuildRecord(ocrText, scene) {
    const banner = elements.banner.value;
    if (scene === "result") {
      lastResultText = ocrText;
      lastResultAt = Date.now();
      elements.resultText.textContent = ocrText.trim() || "识别到结果画面，但 OCR 未读取到文本。";
      setStatus("已识别到抽卡结果，等待卡池保底画面。", "idle");
      return;
    }

    const remainingPity = recognition.parseRemainingPity(ocrText);
    if (!Number.isInteger(remainingPity)) return;
    const resultTextIsFresh = lastResultText && Date.now() - lastResultAt < 120000;
    const detection = recognition.buildDetectedRecord({
      banner,
      resultText: resultTextIsFresh ? lastResultText : "",
      pityText: ocrText,
      remainingPity
    });
    if (!detection.ok) {
      setStatus(detection.error, "error");
      return;
    }
    if (detection.needsConfirmation) showPending(detection);
    else applyDetectedRecord(detection);
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
      } else {
        tryBuildRecord(result.text, scene);
      }
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

    stopMonitor();
    planner.setCurrentBanner(elements.banner.value);
    stream = await createStream(elements.source.value);
    video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    isRunning = true;
    isPaused = false;
    updateMonitorControls();
    timer = window.setInterval(tick, 2600);
    await desktop.showOverlay();
    overlayVisible = true;
    updateMonitorControls();
    await setOverlayInteraction(true, "浮窗已显示，可直接操作。");
    setStatus("监控已启动，请在游戏中完成十连并回到卡池界面。", "success");
  }

  function stopMonitor() {
    if (timer) window.clearInterval(timer);
    timer = null;
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
      planner?.setCurrentBanner(banner);
      setStatus(`已切换至${banner === "weapon" ? "限定武器池" : "限定角色池"}。`, "idle");
    }
    if (payload.command === "overlay-interactive-changed") {
      overlayInteractive = Boolean(payload.payload?.interactive);
      elements.overlayInteraction.checked = !overlayInteractive;
      updateOverlay(payload.payload?.message || "浮窗交互状态已更新。");
    }
  });

  document.addEventListener("wuwa:planner-state", () => updateOverlay("规划状态已刷新。"));
  requireDesktop();
  updateMonitorControls();
  refreshSources().catch((error) => setStatus(`窗口列表读取失败：${error.message || error}`, "error"));
})();
