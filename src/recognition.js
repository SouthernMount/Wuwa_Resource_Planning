(function attachRecognition(global) {
  "use strict";

  const standardFiveStarCharacters = [
    "维里奈",
    "安可",
    "卡卡罗",
    "凌阳",
    "鉴心"
  ];

  const ignoredResultWords = new Set([
    "获得",
    "跳过",
    "确认",
    "详情",
    "角色",
    "武器",
    "物品",
    "道具",
    "回响",
    "五星",
    "四星",
    "三星",
    "限定",
    "常驻",
    "鸣潮",
    "抽卡",
    "调谐",
    "唤取"
  ]);

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, "")
      .replace(/[|｜]/g, "丨")
      .replace(/[，。,.!！?？:：;；"'“”‘’()[\]{}<>《》]/g, "")
      .trim();
  }

  function normalizeName(name) {
    return normalizeText(name).replace(/[·・]/g, "");
  }

  function isStandardCharacter(name) {
    const normalized = normalizeName(name);
    return standardFiveStarCharacters.some((standardName) => normalizeName(standardName) === normalized);
  }

  function classifyFiveStarNames(names, banner) {
    const cleanedNames = (names || [])
      .map(normalizeName)
      .filter(Boolean);
    if (banner === "weapon") {
      return {
        banner: "weapon",
        upCount: cleanedNames.length,
        offCount: 0,
        names: cleanedNames,
        offNames: [],
        upNames: cleanedNames
      };
    }

    const offNames = [];
    const upNames = [];
    for (const name of cleanedNames) {
      if (isStandardCharacter(name)) offNames.push(name);
      else upNames.push(name);
    }

    return {
      banner: "character",
      upCount: upNames.length,
      offCount: offNames.length,
      names: cleanedNames,
      offNames,
      upNames
    };
  }

  function detectScene(text) {
    const normalized = normalizeText(text);
    const hasGachaTitle = /调谐|唤取/.test(normalized);
    const hasResultAction = /获得|跳过/.test(normalized);
    if (hasGachaTitle && hasResultAction) return "result";
    return "unknown";
  }

  function extractCandidateNames(text) {
    const rawLines = String(text || "")
      .split(/\r?\n/)
      .map((line) => normalizeName(line))
      .filter(Boolean);
    const names = [];

    for (const line of rawLines) {
      let matchedStandard = false;
      for (const standardName of standardFiveStarCharacters) {
        if (line.includes(standardName)) {
          names.push(standardName);
          matchedStandard = true;
        }
      }
      if (matchedStandard) continue;

      if (/^\d+$/.test(line)) continue;
      if (ignoredResultWords.has(line)) continue;
      if (line.length < 2 || line.length > 6) continue;
      if (!/[\u4e00-\u9fa5]/.test(line)) continue;
      names.push(line);
    }

    return names;
  }

  function describeRecord(record) {
    if (!record) return "";
    const totalGolds = record.upCount + record.offCount;
    if (totalGolds === 0) return "本次未识别五星";
    const bannerText = record.banner === "weapon" ? "武器池" : "角色池";
    const offText = record.offCount > 0 ? `，非限定 ${record.offCount}` : "";
    return `${bannerText}：限定 ${record.upCount}${offText}，最后一金${record.lastResult === "off" ? "非限定" : "限定"}`;
  }

  function buildObservedRecord({ banner, resultText }) {
    const normalizedBanner = banner === "weapon" ? "weapon" : "character";
    const candidateNames = extractCandidateNames(resultText);
    const normalizedText = normalizeText(resultText);
    const hasExplicitGoldMarker = /五星|5星|5★/.test(normalizedText) ||
      candidateNames.some((name) => isStandardCharacter(name));
    if (!hasExplicitGoldMarker) {
      return {
        ok: false,
        error: "未识别到可验证的五星标识，已忽略本次画面以避免误记。"
      };
    }
    const classified = classifyFiveStarNames(candidateNames, normalizedBanner);
    const totalGolds = classified.upCount + classified.offCount;
    const hasMixedCharacterGolds = normalizedBanner === "character" &&
      classified.upCount > 0 && classified.offCount > 0;
    const lastResult = totalGolds === 0 ? "none" : (
      hasMixedCharacterGolds ? null : (classified.offCount > 0 ? "off" : "up")
    );

    return {
      ok: true,
      needsConfirmation: hasMixedCharacterGolds,
      confidence: candidateNames.length > 0 ? 0.72 : 0.56,
      record: {
        banner: normalizedBanner,
        upCount: classified.upCount,
        offCount: classified.offCount,
        lastResult
      },
      names: classified.names,
      offNames: classified.offNames,
      upNames: classified.upNames
    };
  }

  const api = {
    buildObservedRecord,
    classifyFiveStarNames,
    describeRecord,
    detectScene,
    extractCandidateNames,
    isStandardCharacter,
    normalizeName,
    normalizeText,
    standardFiveStarCharacters
  };

  global.WuwaRecognition = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
