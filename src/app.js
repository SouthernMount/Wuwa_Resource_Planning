(function attachApp() {
  "use strict";

  const engine = window.WuwaPlanner;
  const storageKey = "wuwa-resource-planner:v1";
  const elements = {
    form: document.getElementById("plannerForm"),
    targetRank: document.getElementById("targetRank"),
    weaponTarget: document.getElementById("weaponTarget"),
    charPity: document.getElementById("charPity"),
    weaponPity: document.getElementById("weaponPity"),
    charGuaranteed: document.getElementById("charGuaranteed"),
    useSoftPity: document.getElementById("useSoftPity"),
    targetRankText: document.getElementById("targetRankText"),
    weaponTargetText: document.getElementById("weaponTargetText"),
    charPityFill: document.getElementById("charPityFill"),
    weaponPityFill: document.getElementById("weaponPityFill"),
    charPityText: document.getElementById("charPityText"),
    weaponPityText: document.getElementById("weaponPityText"),
    astrites: document.getElementById("astrites"),
    charWaves: document.getElementById("charWaves"),
    weaponWaves: document.getElementById("weaponWaves"),
    completionProbability: document.getElementById("completionProbability"),
    availablePulls: document.getElementById("availablePulls"),
    missingPulls: document.getElementById("missingPulls"),
    missingAstrites: document.getElementById("missingAstrites"),
    pullSequence: document.getElementById("pullSequence"),
    hardPityBreakdown: document.getElementById("hardPityBreakdown"),
    modelBadge: document.getElementById("modelBadge"),
    sessionPanel: document.getElementById("sessionPanel"),
    sessionStatus: document.getElementById("sessionStatus"),
    sessionState: document.getElementById("sessionState"),
    tenPullForm: document.getElementById("tenPullForm"),
    tenPullBanner: document.getElementById("tenPullBanner"),
    tenPullGrid: document.getElementById("tenPullGrid"),
    goldResults: document.getElementById("goldResults"),
    tenPullNote: document.getElementById("tenPullNote"),
    finishSession: document.getElementById("finishSession"),
    historyList: document.getElementById("historyList"),
    futurePanel: document.getElementById("futurePanel"),
    futureStatus: document.getElementById("futureStatus"),
    futureLockedNote: document.getElementById("futureLockedNote"),
    futureForm: document.getElementById("futureForm"),
    currentDate: document.getElementById("currentDate"),
    nextBannerDate: document.getElementById("nextBannerDate"),
    hasMonthlyPass: document.getElementById("hasMonthlyPass"),
    futureGain: document.getElementById("futureGain"),
    futureAstrites: document.getElementById("futureAstrites"),
    futureTarget: document.getElementById("futureTarget"),
    futureSurplus: document.getElementById("futureSurplus"),
    futureNote: document.getElementById("futureNote"),
    resetInputs: document.getElementById("resetInputs"),
    undoLastTenPull: document.getElementById("undoLastTenPull"),
    undoAllTenPulls: document.getElementById("undoAllTenPulls"),
    clearStorage: document.getElementById("clearStorage"),
    saveStatus: document.getElementById("saveStatus"),
    toastStack: document.getElementById("toastStack")
  };

  let appState = loadState();
  let planningRenderTaskId = 0;
  let tenPullMarks = Array(10).fill(null);
  let previewTaskId = 0;

  function defaultState() {
    return {
      lastInput: null,
      activeSession: null,
      histories: [],
      futureInput: null
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
    } catch (error) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(appState));
    elements.saveStatus.textContent = "已保存到本地";
  }

  function showToast(message) {
    if (!elements.toastStack || !message) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    elements.toastStack.appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add("is-visible"));
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 220);
    }, 2200);
  }

  function readInput() {
    return {
      goal: {
        characterRank: Number(elements.targetRank.value),
        weaponCount: Number(elements.weaponTarget.value)
      },
      bannerState: {
        characterPity: Number(elements.charPity.value),
        weaponPity: Number(elements.weaponPity.value),
        characterGuaranteed: elements.charGuaranteed.checked
      },
      resources: {
        astrites: Number(elements.astrites.value),
        characterWaves: Number(elements.charWaves.value),
        weaponWaves: Number(elements.weaponWaves.value)
      },
      useSoftPity: elements.useSoftPity.checked
    };
  }

  function writeInput(input) {
    if (!input) return;
    elements.targetRank.value = input.goal.characterRank;
    elements.weaponTarget.value = input.goal.weaponCount;
    elements.charPity.value = input.bannerState.characterPity;
    elements.weaponPity.value = input.bannerState.weaponPity;
    elements.charGuaranteed.checked = Boolean(input.bannerState.characterGuaranteed);
    elements.astrites.value = input.resources.astrites;
    elements.charWaves.value = input.resources.characterWaves;
    elements.weaponWaves.value = input.resources.weaponWaves;
    elements.useSoftPity.checked = input.useSoftPity !== false;
    syncInputDecorations();
  }

  function setSegmentedState(controlName, value) {
    document.querySelectorAll(`[data-control="${controlName}"] button`).forEach((button) => {
      const active = button.dataset.value === String(value);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncPityMeter(input, fill, text) {
    const value = Math.max(0, Math.min(79, Number(input.value) || 0));
    input.value = value;
    fill.style.width = `${(value / 80) * 100}%`;
    text.textContent = `距离硬保底 ${80 - value} 抽`;
  }

  function syncInputDecorations() {
    const targetRank = Number(elements.targetRank.value);
    const weaponTarget = Number(elements.weaponTarget.value);
    elements.targetRankText.textContent = `${targetRank} 命`;
    elements.weaponTargetText.textContent = `精 ${weaponTarget}`;
    setSegmentedState("targetRank", targetRank);
    setSegmentedState("weaponTarget", weaponTarget);
    syncPityMeter(elements.charPity, elements.charPityFill, elements.charPityText);
    syncPityMeter(elements.weaponPity, elements.weaponPityFill, elements.weaponPityText);
  }

  function scheduleBasicPreview() {
    syncInputDecorations();
    if (appState.activeSession) return;
    const taskId = ++previewTaskId;
    window.setTimeout(() => {
      if (taskId !== previewTaskId || appState.activeSession) return;
      scheduleCalculateAndRender(readInput(), { characterCopies: 0, weaponCopies: 0 });
    }, 160);
  }

  function formatPercent(value) {
    if (value >= 0.999999) return "100%";
    if (value <= 0.000001) return "0%";
    return `${(value * 100).toFixed(value < 0.1 ? 2 : 1)}%`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(value);
  }

  function currencyIconMarkup(type) {
    return `<i class="currency-icon icon-${type}" aria-hidden="true"></i>`;
  }

  function describeGoal(goal) {
    return `${goal.characterRank}+${goal.weaponCount}`;
  }

  function parseLocalDate(isoDate) {
    const parts = String(isoDate || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }

  function toLocalIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function daysBetweenInclusiveTomorrow(startIso, endIso) {
    const start = parseLocalDate(startIso);
    const end = parseLocalDate(endIso);
    if (!start || !end || end <= start) return [];
    const dates = [];
    for (let cursor = addDays(start, 1); cursor <= end; cursor = addDays(cursor, 1)) {
      dates.push(new Date(cursor));
    }
    return dates;
  }

  function calculateFutureIncome(startIso, endIso, hasMonthlyPass) {
    const dates = daysBetweenInclusiveTomorrow(startIso, endIso);
    const daily = hasMonthlyPass ? 150 : 60;
    const mondayCount = dates.filter((date) => date.getDay() === 1).length;
    return {
      days: dates.length,
      mondayCount,
      daily,
      dailyGain: dates.length * daily,
      weeklyGain: mondayCount * 160,
      totalGain: dates.length * daily + mondayCount * 160
    };
  }

  function describeSequence(sequence) {
    if (sequence.length === 0) return "目标已完成";
    const groups = [];
    for (const banner of sequence) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.banner === banner) {
        lastGroup.count += 1;
      } else {
        groups.push({ banner, count: 1 });
      }
    }
    return groups
      .map((group) => `${group.banner === "character" ? "限定角色" : "限定武器"} × ${group.count}`)
      .join(" → ");
  }

  function renderSequence(sequence) {
    elements.pullSequence.innerHTML = "";
    if (sequence.length === 0) {
      elements.pullSequence.textContent = "目标已完成";
      return;
    }
    const groups = [];
    for (const banner of sequence) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.banner === banner) {
        lastGroup.count += 1;
      } else {
        groups.push({ banner, count: 1 });
      }
    }
    groups.forEach((group, index) => {
      if (index > 0) {
        const arrow = document.createElement("span");
        arrow.className = "route-arrow";
        arrow.textContent = "→";
        elements.pullSequence.appendChild(arrow);
      }
      const chip = document.createElement("span");
      chip.className = `route-chip ${group.banner === "weapon" ? "weapon" : "character"}`;
      chip.textContent = `${group.banner === "character" ? "限定角色" : "限定武器"} × ${group.count}`;
      elements.pullSequence.appendChild(chip);
    });
  }

  function renderHardPityBreakdown(missing) {
    const items = [
      ["角色池", `${formatNumber(missing.characterDraws)} 抽`, "primary"],
      ["武器池", `${formatNumber(missing.weaponDraws)} 抽`, "weapon"]
    ];
    elements.hardPityBreakdown.innerHTML = "";
    for (const [label, value, tone] of items) {
      const item = document.createElement("span");
      item.className = `hard-pity-item ${tone}`;
      item.innerHTML = `<small>${label}</small><strong>${value}</strong>`;
      elements.hardPityBreakdown.appendChild(item);
    }
  }

  function renderFutureNote({ currentIso, nextIso, income, estimate, probability }) {
    elements.futureNote.innerHTML = "";
    const summary = document.createElement("div");
    summary.className = "future-note-summary";
    [
      ["估算区间", `${currentIso || "--"} 到 ${nextIso || "--"}`],
      ["累计天数", `${formatNumber(income.days)} 天`],
      ["周一数量", `${formatNumber(income.mondayCount)} 个`]
    ].forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "future-note-item";
      item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      summary.appendChild(item);
    });
    elements.futureNote.appendChild(summary);

    const detail = document.createElement("div");
    detail.className = "future-note-detail";
    if (estimate && estimate.target) {
      detail.innerHTML =
        `<span>计算结论</span>` +
        `<strong>100% 可完成最高目标 ${describeGoal(estimate.target)}</strong>` +
        `<p>按硬保底和优先 0+1 原则，结余${currencyIconMarkup("radiant")}浮金 ${formatNumber(estimate.resources.characterWaves)}，${currencyIconMarkup("forging")}铸潮 ${formatNumber(estimate.resources.weaponWaves)}。</p>`;
    } else {
      detail.innerHTML =
        `<span>计算结论</span>` +
        `<strong>未达 0+0 保底</strong>` +
        `<p>当前资源无法 100% 抽到至少一个限定角色；抽到一个限定角色的概率为 ${formatPercent(probability)}。</p>`;
    }
    elements.futureNote.appendChild(detail);
  }

  function setPlanningLoading() {
    elements.completionProbability.textContent = "计算中...";
    elements.availablePulls.textContent = "计算中...";
    elements.missingPulls.textContent = "计算中...";
    elements.missingAstrites.textContent = "计算中...";
    elements.pullSequence.textContent = "正在计算抽取顺序...";
    elements.hardPityBreakdown.textContent = "正在计算吃满时完成计划还需消耗...";
    elements.modelBadge.textContent = "计算中";
    document.body.classList.add("is-calculating");
  }

  function calculateAndRender(input, progress) {
    const activeProgress = progress || { characterCopies: 0, weaponCopies: 0 };
    const probability = engine.calculateCompletionProbability({
      ...input,
      progress: activeProgress
    });
    const missing = engine.missingForHardPity(input.goal, input.bannerState, activeProgress, input.resources);
    const available = engine.availablePullSummary(input.resources);

    elements.completionProbability.textContent = formatPercent(probability);
    elements.availablePulls.textContent = `${formatNumber(available.totalFlexible)} 抽`;
    elements.missingPulls.textContent = `${formatNumber(missing.missingTotal)} 抽`;
    elements.missingAstrites.textContent = `${formatNumber(missing.missingAstrites)} 星声`;
    renderSequence(missing.sequence);
    renderHardPityBreakdown(missing);
    elements.modelBadge.textContent = input.useSoftPity ? "软保底估计已启用" : "仅硬保底";
    elements.useSoftPity.checked = input.useSoftPity;

    return { probability, missing };
  }

  function scheduleCalculateAndRender(input, progress, afterRender) {
    const taskId = ++planningRenderTaskId;
    setPlanningLoading();
    window.setTimeout(() => {
      if (taskId !== planningRenderTaskId) return;
      const result = calculateAndRender(input, progress);
      document.body.classList.remove("is-calculating");
      if (afterRender) afterRender(result);
    }, 16);
  }

  function startSession(input) {
    const session = {
      id: Date.now().toString(36),
      startedAt: new Date().toISOString(),
      goal: engine.normalizeGoal(input.goal),
      bannerState: engine.normalizeBannerState(input.bannerState),
      resources: engine.normalizeResources(input.resources),
      useSoftPity: Boolean(input.useSoftPity),
      progress: { characterCopies: 0, weaponCopies: 0 },
      initialSnapshot: {
        bannerState: engine.normalizeBannerState(input.bannerState),
        resources: engine.normalizeResources(input.resources),
        progress: { characterCopies: 0, weaponCopies: 0 }
      },
      records: []
    };
    appState.activeSession = session;
    appState.lastInput = input;
    resetTenPullMarks();
    saveState();
    renderSession();
  }

  function renderSession() {
    const session = appState.activeSession;
    if (!session) {
      elements.sessionPanel.classList.add("locked");
      elements.sessionStatus.textContent = "基础计算后解锁";
      elements.sessionState.classList.add("empty-state");
      elements.sessionState.textContent = "暂无进行中的抽卡会话。";
      renderHistory([]);
      return;
    }

    elements.sessionPanel.classList.remove("locked");
    elements.sessionState.classList.remove("empty-state");
    elements.sessionStatus.textContent = `进行中：${describeGoal(session.goal)}`;
    const input = {
      goal: session.goal,
      bannerState: session.bannerState,
      resources: session.resources,
      useSoftPity: session.useSoftPity
    };
    renderSessionState(session, "计算中");
    scheduleCalculateAndRender(input, session.progress, (result) => {
      if (!appState.activeSession || appState.activeSession.id !== session.id) return;
      renderSessionState(session, formatPercent(result.probability));
    });
    renderHistory(session.records, session.goal);
  }

  function renderSessionState(session, probabilityText) {
    const items = [
      ["角色进度", `${session.progress.characterCopies}/${session.goal.characterRank + 1}`, "progress"],
      ["武器进度", `${session.progress.weaponCopies}/${session.goal.weaponCount}`, "progress"],
      ["角色垫数", `${session.bannerState.characterPity} 抽`, "pity"],
      ["武器垫数", `${session.bannerState.weaponPity} 抽`, "pity"],
      ["角色小保底", session.bannerState.characterGuaranteed ? "已触发" : "未触发", "guarantee"],
      ["剩余星声", formatNumber(session.resources.astrites), "astrite"],
      ["浮金波纹", formatNumber(session.resources.characterWaves), "radiant"],
      ["铸潮波纹", formatNumber(session.resources.weaponWaves), "forging"],
      ["继续完成概率", probabilityText, "probability"]
    ];
    elements.sessionState.innerHTML = "";
    for (const [label, value, tone] of items) {
      const item = document.createElement("div");
      item.className = `session-state-item is-${tone}`;
      const icon = ["astrite", "radiant", "forging"].includes(tone) ? currencyIconMarkup(tone) : "";
      item.innerHTML = `<span>${icon}${label}</span><strong>${value}</strong>`;
      elements.sessionState.appendChild(item);
    }
  }

  function renderHistory(records, goal) {
    elements.historyList.innerHTML = "";
    const hasRecords = Boolean(records && records.length > 0);
    elements.undoLastTenPull.disabled = !hasRecords;
    elements.undoAllTenPulls.disabled = !hasRecords;
    if (!records || records.length === 0) {
      const item = document.createElement("li");
      item.textContent = "暂无记录。";
      elements.historyList.appendChild(item);
      return;
    }

    for (const record of records) {
      const item = document.createElement("li");
      if (!record.results || !record.afterSnapshot || !goal) {
        item.textContent = record.summary || "记录无法解析。";
        elements.historyList.appendChild(item);
        continue;
      }

      const bannerName = record.banner === "character" ? "角色池" : "武器池";
      const header = document.createElement("div");
      header.className = "history-entry-title";
      header.textContent = `${bannerName}十连`;

      const resultLine = document.createElement("div");
      resultLine.className = "history-result-line";
      if (record.results.length === 0) {
        const empty = document.createElement("span");
        empty.className = "history-gold empty";
        empty.textContent = "无五星";
        resultLine.appendChild(empty);
      } else {
        for (const result of record.results) {
          const badge = document.createElement("span");
          badge.className = `history-gold ${result.result === "up" ? "is-up" : "is-off"}`;
          badge.textContent = `第${result.position}抽${result.result === "up" ? "UP" : "歪"}`;
          resultLine.appendChild(badge);
        }
      }

      const progress = document.createElement("div");
      progress.className = "history-progress";
      progress.textContent =
        `当前角色 ${record.afterSnapshot.progress.characterCopies}/${goal.characterRank + 1}，` +
        `武器 ${record.afterSnapshot.progress.weaponCopies}/${goal.weaponCount}。`;

      item.appendChild(header);
      item.appendChild(resultLine);
      item.appendChild(progress);
      elements.historyList.appendChild(item);
    }
  }

  function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a - b);
  }

  function getPositionSets() {
    const banner = elements.tenPullBanner.value;
    const limited = [];
    const off = [];
    tenPullMarks.forEach((mark, index) => {
      if (mark === "up") limited.push(index + 1);
      if (banner === "character" && mark === "off") off.push(index + 1);
    });
    return { limited, off };
  }

  function getNextSlotMark(current, banner) {
    if (banner === "weapon") return current === "up" ? null : "up";
    if (current === null) return "up";
    if (current === "up") return "off";
    return null;
  }

  function describeSlot(mark, banner) {
    if (mark === "up") return banner === "weapon" ? "限定武器" : "限定";
    if (mark === "off") return "非限定";
    return "非五星";
  }

  function renderTenPullGrid() {
    const banner = elements.tenPullBanner.value;
    elements.tenPullGrid.innerHTML = "";
    tenPullMarks = tenPullMarks.map((mark) => (banner === "weapon" && mark === "off" ? null : mark));

    for (let index = 0; index < 10; index += 1) {
      const mark = tenPullMarks[index];
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "pull-slot";
      slot.dataset.position = String(index + 1);
      if (mark === "up") slot.classList.add("is-up");
      if (mark === "off") slot.classList.add("is-off");
      slot.setAttribute("aria-label", `第 ${index + 1} 抽，${describeSlot(mark, banner)}`);
      slot.innerHTML = `<strong>${describeSlot(mark, banner)}</strong><span>第 ${index + 1} 抽</span>`;
      slot.addEventListener("click", () => {
        tenPullMarks[index] = getNextSlotMark(tenPullMarks[index], banner);
        renderTenPullGrid();
        buildGoldRows();
      });
      elements.tenPullGrid.appendChild(slot);
    }
  }

  function resetTenPullMarks() {
    tenPullMarks = Array(10).fill(null);
    renderTenPullGrid();
    buildGoldRows();
  }

  function buildGoldRows() {
    const banner = elements.tenPullBanner.value;
    const { limited, off } = getPositionSets();
    const positions = uniqueSorted([...limited, ...off]);
    elements.goldResults.innerHTML = "";

    if (positions.length === 0) {
      const note = document.createElement("p");
      note.className = "muted-note";
      note.textContent = "暂无五星标记。";
      elements.goldResults.appendChild(note);
      return;
    }

    for (const position of positions) {
      const row = document.createElement("label");
      row.className = "gold-row";
      if (banner === "character") {
        const result = limited.includes(position) ? "限定 UP" : "非限定";
        row.innerHTML = `
          <span>第 ${position} 抽五星</span>
          <strong>${result}</strong>
        `;
      } else {
        row.innerHTML = `<span>第 ${position} 抽五星</span><strong>限定武器 UP</strong>`;
      }
      elements.goldResults.appendChild(row);
    }
  }

  function collectTenPullRecord() {
    const banner = elements.tenPullBanner.value;
    const { limited, off } = getPositionSets();
    const overlap = limited.filter((position) => off.includes(position));
    if (overlap.length > 0) {
      return {
        ok: false,
        error: `第 ${overlap.join("、")} 抽不能同时标记为限定五星和非限定五星。`
      };
    }
    const results = [
      ...limited.map((position) => ({ position, result: "up" })),
      ...off.map((position) => ({ position, result: "off" }))
    ].sort((a, b) => a.position - b.position);
    return {
      ok: true,
      banner,
      positions: results.map((result) => result.position),
      results
    };
  }

  function summarizeRecord(record, nextSession) {
    const bannerName = record.banner === "character" ? "角色池" : "武器池";
    const goldText = record.positions.length === 0
      ? "无五星"
      : record.results.map((result) => `第${result.position}抽${result.result === "up" ? "UP" : "歪"}`).join("、");
    return `${bannerName}十连：${goldText}。当前角色 ${nextSession.progress.characterCopies}/${nextSession.goal.characterRank + 1}，武器 ${nextSession.progress.weaponCopies}/${nextSession.goal.weaponCount}。`;
  }

  function finishSession() {
    const session = appState.activeSession;
    if (!session) return;

    const nextInput = {
      goal: session.goal,
      bannerState: session.bannerState,
      resources: session.resources,
      useSoftPity: session.useSoftPity
    };
    appState.histories.unshift({
      id: session.id,
      endedAt: new Date().toISOString(),
      goal: session.goal,
      records: session.records,
      finalState: {
        bannerState: session.bannerState,
        resources: session.resources
      }
    });
    appState.histories = appState.histories.slice(0, 20);
    appState.lastInput = nextInput;
    appState.activeSession = null;
    writeInput(nextInput);
    resetTenPullMarks();
    saveState();
    scheduleCalculateAndRender(nextInput, { characterCopies: 0, weaponCopies: 0 });
    renderSession();
    renderFutureModule();
    showToast("抽卡会话已结束，数据已更新");
  }

  function resetFutureResults() {
    elements.futureGain.textContent = "--";
    elements.futureAstrites.textContent = "--";
    elements.futureTarget.textContent = "--";
    elements.futureSurplus.textContent = "--";
  }

  function renderFutureModule() {
    const hasEndedSession = appState.histories.length > 0 && appState.lastInput;
    const todayIso = toLocalIsoDate(new Date());
    elements.currentDate.value = todayIso;

    if (appState.futureInput) {
      elements.nextBannerDate.value = appState.futureInput.nextBannerDate || "";
      elements.hasMonthlyPass.checked = Boolean(appState.futureInput.hasMonthlyPass);
    } else if (!elements.nextBannerDate.value) {
      elements.nextBannerDate.value = todayIso;
    }

    elements.futurePanel.classList.toggle("locked", !hasEndedSession);
    elements.futureStatus.textContent = hasEndedSession ? "已解锁" : "抽卡结束后解锁";
    elements.futureLockedNote.hidden = hasEndedSession;
    for (const control of elements.futureForm.elements) {
      if (control !== elements.currentDate) control.disabled = !hasEndedSession;
    }

    if (!hasEndedSession) {
      resetFutureResults();
      elements.futureNote.innerHTML = "";
      elements.futureNote.textContent = "至少完成并结束一次十连动态记录后，可基于更新后的资源和保底状态估算下个卡池。";
      return;
    }

    estimateAndRenderFuture();
  }

  function estimateAndRenderFuture() {
    if (!(appState.histories.length > 0 && appState.lastInput)) return;

    const baseInput = appState.lastInput;
    const currentIso = elements.currentDate.value || toLocalIsoDate(new Date());
    const nextIso = elements.nextBannerDate.value || currentIso;
    const hasMonthlyPass = elements.hasMonthlyPass.checked;
    const income = calculateFutureIncome(currentIso, nextIso, hasMonthlyPass);
    const projectedResources = {
      ...baseInput.resources,
      astrites: Number(baseInput.resources.astrites || 0) + income.totalGain
    };
    const estimate = engine.estimateHighestGuaranteedTarget({
      bannerState: baseInput.bannerState,
      resources: projectedResources
    });

    elements.futureGain.textContent = `${formatNumber(income.totalGain)} 星声`;
    elements.futureAstrites.textContent = `${formatNumber(projectedResources.astrites)} 星声`;

    if (estimate.target) {
      elements.futureTarget.textContent = describeGoal(estimate.target);
      elements.futureSurplus.textContent = `${formatNumber(estimate.resources.astrites)} 星声`;
      renderFutureNote({ currentIso, nextIso, income, estimate });
    } else {
      const probability = engine.calculateCompletionProbability({
        goal: { characterRank: 0, weaponCount: 0 },
        bannerState: baseInput.bannerState,
        resources: projectedResources,
        progress: { characterCopies: 0, weaponCopies: 0 },
        useSoftPity: baseInput.useSoftPity
      });
      elements.futureTarget.textContent = "未达 0+0 保底";
      elements.futureSurplus.textContent = `${formatNumber(projectedResources.astrites)} 星声`;
      renderFutureNote({ currentIso, nextIso, income, probability });
    }

    appState.futureInput = {
      nextBannerDate: nextIso,
      hasMonthlyPass
    };
    saveState();
  }

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = readInput();
    startSession(input);
    showToast("已根据基础数据开启本轮规划");
  });

  document.querySelectorAll(".segmented-control button").forEach((button) => {
    button.addEventListener("click", () => {
      const control = button.closest(".segmented-control").dataset.control;
      elements[control].value = button.dataset.value;
      scheduleBasicPreview();
    });
  });

  [
    elements.charPity,
    elements.weaponPity,
    elements.astrites,
    elements.charWaves,
    elements.weaponWaves,
    elements.charGuaranteed
  ].forEach((control) => {
    control.addEventListener("input", scheduleBasicPreview);
    control.addEventListener("change", scheduleBasicPreview);
  });

  elements.tenPullBanner.addEventListener("change", () => {
    tenPullMarks = tenPullMarks.map((mark) => (elements.tenPullBanner.value === "weapon" && mark === "off" ? null : mark));
    renderTenPullGrid();
    buildGoldRows();
  });
  elements.useSoftPity.addEventListener("change", () => updateSoftPity(elements.useSoftPity.checked));

  elements.tenPullForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!appState.activeSession) return;

    const record = collectTenPullRecord();
    if (!record.ok) {
      alert(record.error);
      return;
    }
    const beforeSnapshot = {
      bannerState: engine.normalizeBannerState(appState.activeSession.bannerState),
      resources: engine.normalizeResources(appState.activeSession.resources),
      progress: engine.normalizeProgress(appState.activeSession.progress)
    };
    const result = engine.validateAndApplyTenPull(appState.activeSession, record);
    if (!result.ok) {
      alert(result.error);
      return;
    }

    const nextSession = result.session;
    const afterSnapshot = {
      bannerState: engine.normalizeBannerState(nextSession.bannerState),
      resources: engine.normalizeResources(nextSession.resources),
      progress: engine.normalizeProgress(nextSession.progress)
    };
    nextSession.records = [
      ...appState.activeSession.records,
      {
        ...record,
        beforeSnapshot,
        afterSnapshot,
        summary: summarizeRecord(record, nextSession),
        createdAt: new Date().toISOString()
      }
    ];
    appState.activeSession = nextSession;
    saveState();
    resetTenPullMarks();
    renderSession();
    showToast("已记录本次十连");
  });

  elements.finishSession.addEventListener("click", finishSession);
  elements.futureForm.addEventListener("submit", (event) => {
    event.preventDefault();
    estimateAndRenderFuture();
  });
  elements.nextBannerDate.addEventListener("change", estimateAndRenderFuture);
  elements.hasMonthlyPass.addEventListener("change", estimateAndRenderFuture);

  function restoreSessionSnapshot(snapshot) {
    if (!appState.activeSession || !snapshot) return;
    appState.activeSession.bannerState = engine.normalizeBannerState(snapshot.bannerState);
    appState.activeSession.resources = engine.normalizeResources(snapshot.resources);
    appState.activeSession.progress = engine.normalizeProgress(snapshot.progress);
  }

  elements.undoLastTenPull.addEventListener("click", () => {
    const session = appState.activeSession;
    if (!session || session.records.length === 0) return;
    const records = [...session.records];
    const lastRecord = records.pop();
    restoreSessionSnapshot(lastRecord.beforeSnapshot || session.initialSnapshot);
    appState.activeSession.records = records;
    saveState();
    renderSession();
    showToast("已回溯上一次十连");
  });

  elements.undoAllTenPulls.addEventListener("click", () => {
    const session = appState.activeSession;
    if (!session || session.records.length === 0) return;
    restoreSessionSnapshot(session.initialSnapshot);
    appState.activeSession.records = [];
    saveState();
    renderSession();
    showToast("已回溯本次所有记录");
  });

  function updateSoftPity(enabled) {
    elements.useSoftPity.checked = enabled;

    if (appState.activeSession) {
      appState.activeSession.useSoftPity = enabled;
      appState.lastInput = {
        goal: appState.activeSession.goal,
        bannerState: appState.activeSession.bannerState,
        resources: appState.activeSession.resources,
        useSoftPity: enabled
      };
      saveState();
      renderSession();
      showToast(enabled ? "已启用软保底估计" : "已切换为仅硬保底");
      return;
    }

    const input = readInput();
    input.useSoftPity = enabled;
    appState.lastInput = input;
    saveState();
    scheduleCalculateAndRender(input, { characterCopies: 0, weaponCopies: 0 });
    showToast(enabled ? "已启用软保底估计" : "已切换为仅硬保底");
  }

  elements.resetInputs.addEventListener("click", () => {
    writeInput({
      goal: { characterRank: 0, weaponCount: 1 },
      bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
      resources: { astrites: 0, characterWaves: 0, weaponWaves: 0 },
      useSoftPity: true
    });
    scheduleCalculateAndRender(readInput(), { characterCopies: 0, weaponCopies: 0 });
    showToast("基础输入已重置");
  });

  elements.clearStorage.addEventListener("click", () => {
    if (!confirm("确认清除本地保存的数据？")) return;
    localStorage.removeItem(storageKey);
    appState = defaultState();
    elements.saveStatus.textContent = "本地数据已清除";
    writeInput({
      goal: { characterRank: 0, weaponCount: 1 },
      bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
      resources: { astrites: 0, characterWaves: 0, weaponWaves: 0 },
      useSoftPity: true
    });
    resetTenPullMarks();
    scheduleCalculateAndRender(readInput(), { characterCopies: 0, weaponCopies: 0 });
    renderSession();
    renderFutureModule();
    showToast("本地数据已清除");
  });

  writeInput(appState.lastInput || {
    goal: { characterRank: 0, weaponCount: 1 },
    bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
    resources: { astrites: 0, characterWaves: 0, weaponWaves: 0 },
    useSoftPity: true
  });
  renderSession();
  if (!appState.activeSession) {
    scheduleCalculateAndRender(readInput(), { characterCopies: 0, weaponCopies: 0 });
  }
  renderFutureModule();
  renderTenPullGrid();
  buildGoldRows();
})();
