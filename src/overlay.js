(function attachOverlay() {
  "use strict";

  const desktop = window.WuwaDesktop;
  const elements = {
    status: document.getElementById("overlayStatus"),
    probability: document.getElementById("overlayProbability"),
    resources: document.getElementById("overlayResources"),
    pity: document.getElementById("overlayPity"),
    progress: document.getElementById("overlayProgress"),
    message: document.getElementById("overlayMessage"),
    pending: document.getElementById("overlayPending"),
    pendingText: document.getElementById("overlayPendingText"),
    confirmUp: document.getElementById("overlayConfirmUp"),
    confirmOff: document.getElementById("overlayConfirmOff"),
    reject: document.getElementById("overlayReject"),
    pause: document.getElementById("overlayPause"),
    hide: document.getElementById("overlayHide"),
    interactive: document.getElementById("overlayInteractive"),
    banner: document.getElementById("overlayBanner")
  };

  let paused = false;
  let interactive = true;
  let pendingResizeFrame = null;
  let requestedHeight = 0;

  function setText(element, value) {
    element.textContent = value || "--";
  }

  function renderRows(element, rows, fallbackText) {
    element.innerHTML = "";
    if (!Array.isArray(rows) || rows.length === 0) {
      element.textContent = fallbackText || "--";
      return;
    }

    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "overlay-list-row";

      const label = document.createElement("span");
      label.className = "overlay-row-label";
      if (row.type) {
        const icon = document.createElement("i");
        icon.className = `currency-icon icon-${row.type}`;
        icon.setAttribute("aria-hidden", "true");
        label.appendChild(icon);
      }
      label.appendChild(document.createTextNode(row.label || "--"));

      const value = document.createElement("strong");
      value.textContent = row.value || "--";

      item.append(label, value);
      element.appendChild(item);
    }
  }

  function fitOverlayHeight() {
    if (!desktop?.resizeOverlay) return;
    if (pendingResizeFrame) window.cancelAnimationFrame(pendingResizeFrame);
    pendingResizeFrame = window.requestAnimationFrame(() => {
      pendingResizeFrame = null;
      const card = document.getElementById("overlayCard");
      if (!card) return;
      const nextHeight = Math.ceil(card.scrollHeight + 2);
      if (Math.abs(nextHeight - requestedHeight) < 2) return;
      requestedHeight = nextHeight;
      desktop.resizeOverlay(nextHeight).catch(() => {});
    });
  }

  function render(payload = {}) {
    if (typeof payload.interactive === "boolean") {
      interactive = payload.interactive;
    }
    if (payload.banner === "character" || payload.banner === "weapon") {
      elements.banner.value = payload.banner;
    }
    elements.banner.disabled = Boolean(payload.bannerDisabled);
    setText(elements.status, payload.status || "监控中");
    setText(elements.probability, payload.probabilityText);
    renderRows(elements.resources, payload.resources, payload.resourcesText);
    renderRows(elements.pity, payload.pity, payload.pityText);
    renderRows(elements.progress, payload.progress, payload.progressText);
    elements.message.textContent = payload.message || "正在等待抽卡画面。";

    if (payload.pendingRecordText) {
      elements.pending.hidden = false;
      elements.pendingText.textContent = payload.pendingRecordText;
    } else {
      elements.pending.hidden = true;
      elements.pendingText.textContent = "--";
    }

    elements.pause.textContent = paused ? "继续" : "暂停";
    elements.interactive.textContent = interactive ? "切换至鼠标穿透" : "切换至可操作浮窗";
    elements.interactive.title = interactive
      ? "切换后浮窗不再接收鼠标点击，可按 Ctrl+Shift+O 或在主窗口恢复操作。"
      : "鼠标穿透状态时无法接收点击，请按 Ctrl+Shift+O 或在主窗口恢复操作。";
    fitOverlayHeight();
  }

  if (desktop) {
    desktop.onOverlayUpdate(render);
  }

  elements.confirmUp.addEventListener("click", () => {
    desktop?.sendOverlayCommand("confirm-pending", { lastResult: "up" });
  });

  elements.confirmOff.addEventListener("click", () => {
    desktop?.sendOverlayCommand("confirm-pending", { lastResult: "off" });
  });

  elements.reject.addEventListener("click", () => {
    desktop?.sendOverlayCommand("reject-pending");
  });

  elements.pause.addEventListener("click", () => {
    paused = !paused;
    desktop?.sendOverlayCommand(paused ? "pause-monitor" : "resume-monitor");
    render();
  });

  elements.hide.addEventListener("click", () => {
    desktop?.hideOverlay();
    desktop?.sendOverlayCommand("hide-overlay");
  });

  elements.interactive.addEventListener("click", async () => {
    interactive = !interactive;
    interactive = await desktop?.setOverlayInteractive(interactive);
    desktop?.sendOverlayCommand("toggle-interactive", { interactive });
    render();
  });

  elements.banner.addEventListener("change", () => {
    desktop?.sendOverlayCommand("set-banner", { banner: elements.banner.value });
  });

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(fitOverlayHeight);
    observer.observe(document.getElementById("overlayCard"));
  }
  window.addEventListener("load", fitOverlayHeight);

  render({ status: "待启动" });
})();
