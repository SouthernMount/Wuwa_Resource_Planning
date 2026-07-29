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
    limitedFiveStarPositions: document.getElementById("limitedFiveStarPositions"),
    offFiveStarField: document.getElementById("offFiveStarField"),
    offFiveStarPositions: document.getElementById("offFiveStarPositions"),
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
    resetSession: document.getElementById("resetSession"),
    clearStorage: document.getElementById("clearStorage"),
    saveStatus: document.getElementById("saveStatus")
  };

  let appState = loadState();
  let planningRenderTaskId = 0;

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
  }

  function formatPercent(value) {
    if (value >= 0.999999) return "100%";
    if (value <= 0.000001) return "0%";
    return `${(value * 100).toFixed(value < 0.1 ? 2 : 1)}%`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(value);
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

  function setPlanningLoading() {
    elements.completionProbability.textContent = "计算中...";
    elements.availablePulls.textContent = "计算中...";
    elements.missingPulls.textContent = "计算中...";
    elements.missingAstrites.textContent = "计算中...";
    elements.pullSequence.textContent = "正在计算抽取顺序...";
    elements.hardPityBreakdown.textContent = "正在计算硬保底需求...";
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
    elements.pullSequence.textContent = describeSequence(missing.sequence);
    elements.hardPityBreakdown.textContent = `硬保底最多还需角色 ${missing.characterDraws} 抽、武器 ${missing.weaponDraws} 抽；当前资源缺口为角色 ${missing.missingCharacter} 抽、武器 ${missing.missingWeapon} 抽。`;
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
    saveState();
    renderSession();
  }

  function renderSession() {
    const session = appState.activeSession;
    if (!session) {
      elements.sessionPanel.classList.add("locked");
      elements.sessionStatus.textContent = "基础计算后解锁";
      elements.sessionState.textContent = "暂无进行中的抽卡会话。";
      renderHistory([]);
      return;
    }

    elements.sessionPanel.classList.remove("locked");
    elements.sessionStatus.textContent = `进行中：${describeGoal(session.goal)}`;
    const input = {
      goal: session.goal,
      bannerState: session.bannerState,
      resources: session.resources,
      useSoftPity: session.useSoftPity
    };
    elements.sessionState.textContent =
      `已获得角色 ${session.progress.characterCopies}/${session.goal.characterRank + 1}，武器 ${session.progress.weaponCopies}/${session.goal.weaponCount}；` +
      `角色垫数 ${session.bannerState.characterPity}，武器垫数 ${session.bannerState.weaponPity}，` +
      `角色池${session.bannerState.characterGuaranteed ? "已触发小保底" : "未触发小保底"}；` +
      `剩余星声 ${session.resources.astrites}，浮金 ${session.resources.characterWaves}，铸潮 ${session.resources.weaponWaves}；` +
      `继续抽取完成概率正在计算。`;
    scheduleCalculateAndRender(input, session.progress, (result) => {
      if (!appState.activeSession || appState.activeSession.id !== session.id) return;
      elements.sessionState.textContent =
        `已获得角色 ${session.progress.characterCopies}/${session.goal.characterRank + 1}，武器 ${session.progress.weaponCopies}/${session.goal.weaponCount}；` +
        `角色垫数 ${session.bannerState.characterPity}，武器垫数 ${session.bannerState.weaponPity}，` +
        `角色池${session.bannerState.characterGuaranteed ? "已触发小保底" : "未触发小保底"}；` +
        `剩余星声 ${session.resources.astrites}，浮金 ${session.resources.characterWaves}，铸潮 ${session.resources.weaponWaves}；` +
        `继续抽取完成概率 ${formatPercent(result.probability)}。`;
    });
    renderHistory(session.records);
  }

  function renderHistory(records) {
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
      item.textContent = record.summary;
      elements.historyList.appendChild(item);
    }
  }

  function parsePositionsFrom(raw) {
    if (!raw) return [];
    return raw.split(/[,\s，、]+/)
      .filter(Boolean)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 10)
      .sort((a, b) => a - b);
  }

  function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a - b);
  }

  function getPositionSets() {
    const banner = elements.tenPullBanner.value;
    const limited = uniqueSorted(parsePositionsFrom(elements.limitedFiveStarPositions.value.trim()));
    const off = banner === "character"
      ? uniqueSorted(parsePositionsFrom(elements.offFiveStarPositions.value.trim()))
      : [];
    return { limited, off };
  }

  function buildGoldRows() {
    const banner = elements.tenPullBanner.value;
    const { limited, off } = getPositionSets();
    const positions = uniqueSorted([...limited, ...off]);
    elements.goldResults.innerHTML = "";
    elements.offFiveStarField.hidden = banner === "weapon";

    if (positions.length === 0) {
      const note = document.createElement("p");
      note.className = "muted-note";
      note.textContent = "暂无五星结果项。";
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
    saveState();
    scheduleCalculateAndRender(nextInput, { characterCopies: 0, weaponCopies: 0 });
    renderSession();
    renderFutureModule();
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
      elements.futureNote.textContent =
        `从 ${currentIso} 到 ${nextIso} 共计 ${income.days} 天，包含 ${income.mondayCount} 个周一。` +
        `按硬保底和优先0+1原则，100%可完成最高目标 ${describeGoal(estimate.target)}；` +
        `结余浮金 ${estimate.resources.characterWaves}，铸潮 ${estimate.resources.weaponWaves}。`;
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
      elements.futureNote.textContent =
        `从 ${currentIso} 到 ${nextIso} 共计 ${income.days} 天，包含 ${income.mondayCount} 个周一。` +
        `当前资源无法 100% 抽到至少一个限定角色；抽到一个限定角色的概率为 ${formatPercent(probability)}。`;
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
  });

  elements.tenPullBanner.addEventListener("change", buildGoldRows);
  elements.limitedFiveStarPositions.addEventListener("input", buildGoldRows);
  elements.offFiveStarPositions.addEventListener("input", buildGoldRows);
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
    elements.limitedFiveStarPositions.value = "";
    elements.offFiveStarPositions.value = "";
    saveState();
    buildGoldRows();
    renderSession();
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
  });

  elements.undoAllTenPulls.addEventListener("click", () => {
    const session = appState.activeSession;
    if (!session || session.records.length === 0) return;
    restoreSessionSnapshot(session.initialSnapshot);
    appState.activeSession.records = [];
    saveState();
    renderSession();
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
      return;
    }

    const input = readInput();
    input.useSoftPity = enabled;
    appState.lastInput = input;
    saveState();
    scheduleCalculateAndRender(input, { characterCopies: 0, weaponCopies: 0 });
  }

  elements.resetInputs.addEventListener("click", () => {
    writeInput({
      goal: { characterRank: 0, weaponCount: 1 },
      bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
      resources: { astrites: 0, characterWaves: 0, weaponWaves: 0 },
      useSoftPity: true
    });
    scheduleCalculateAndRender(readInput(), { characterCopies: 0, weaponCopies: 0 });
  });

  elements.resetSession.addEventListener("click", () => {
    appState.activeSession = null;
    saveState();
    renderSession();
    renderFutureModule();
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
    scheduleCalculateAndRender(readInput(), { characterCopies: 0, weaponCopies: 0 });
    renderSession();
    renderFutureModule();
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
  buildGoldRows();
})();
