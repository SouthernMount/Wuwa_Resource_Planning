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

  function parseRemainingPity(text) {
    const normalized = normalizeText(text);
    const patterns = [
      /距离(?:获得)?(?:五星|5星|5★)?(?:角色|武器)?(?:保底)?(?:还需|还有|剩余)?(\d{1,2})抽/,
      /(?:还需|还有|剩余)(\d{1,2})抽(?:必得|保底|获得)?(?:五星|5星|5★)?/,
      /(\d{1,2})抽(?:内)?(?:必得|保底|获得)(?:五星|5星|5★)?/
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isInteger(value) && value >= 1 && value <= 80) return value;
    }

    return null;
  }

  function detectScene(text) {
    const normalized = normalizeText(text);
    if (/距离|保底|必得|还需|剩余/.test(normalized) && /抽/.test(normalized)) return "pity";
    if (/获得|五星|5星|调谐|唤取|跳过|确认/.test(normalized)) return "result";
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
    if (totalGolds === 0) return `无五星，保底剩余 ${record.remainingPity} 抽`;
    const bannerText = record.banner === "weapon" ? "武器池" : "角色池";
    const offText = record.offCount > 0 ? `，非限定 ${record.offCount}` : "";
    return `${bannerText}：限定 ${record.upCount}${offText}，最后一金${record.lastResult === "off" ? "非限定" : "限定"}，保底剩余 ${record.remainingPity} 抽`;
  }

  function buildDetectedRecord({ banner, resultText, pityText, remainingPity }) {
    const normalizedBanner = banner === "weapon" ? "weapon" : "character";
    const parsedRemainingPity = Number.isInteger(remainingPity) ? remainingPity : parseRemainingPity(pityText);
    if (!Number.isInteger(parsedRemainingPity)) {
      return {
        ok: false,
        needsConfirmation: true,
        error: "未识别到十连后距离五星保底抽数。"
      };
    }

    const candidateNames = extractCandidateNames(resultText);
    const classified = classifyFiveStarNames(candidateNames, normalizedBanner);
    const totalGolds = classified.upCount + classified.offCount;
    const hasMixedCharacterGolds = normalizedBanner === "character" &&
      classified.upCount > 0 &&
      classified.offCount > 0;
    const lastResult = totalGolds === 0 ? "none" : (
      hasMixedCharacterGolds ? null : (classified.offCount > 0 ? "off" : "up")
    );

    return {
      ok: true,
      needsConfirmation: hasMixedCharacterGolds,
      confidence: candidateNames.length > 0 || parsedRemainingPity < 80 ? 0.72 : 0.48,
      record: {
        banner: normalizedBanner,
        upCount: classified.upCount,
        offCount: classified.offCount,
        lastResult,
        remainingPity: parsedRemainingPity
      },
      names: classified.names,
      offNames: classified.offNames,
      upNames: classified.upNames
    };
  }

  const api = {
    buildDetectedRecord,
    classifyFiveStarNames,
    describeRecord,
    detectScene,
    extractCandidateNames,
    isStandardCharacter,
    normalizeName,
    normalizeText,
    parseRemainingPity,
    standardFiveStarCharacters
  };

  global.WuwaRecognition = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
