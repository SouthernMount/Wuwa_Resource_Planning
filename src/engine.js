(function attachEngine(global) {
  "use strict";

  const MAX_PITY = 80;
  const FIVE_STAR_BASE_RATE = 0.008;
  const ASTRITES_PER_PULL = 160;
  const fiveStarPmfCache = new Map();
  const characterCopyPmfCache = new Map();
  const copyCountPmfCache = new Map();

  function clampInteger(value, min, max) {
    const number = Number.parseInt(value, 10);
    if (Number.isNaN(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function toPullsFromAstrites(astrites) {
    return Math.floor(Math.max(0, Number(astrites) || 0) / ASTRITES_PER_PULL);
  }

  function getFiveStarRate(pity, useSoftPity) {
    const nextPull = pity + 1;
    if (nextPull >= MAX_PITY) return 1;
    if (!useSoftPity) return FIVE_STAR_BASE_RATE;
    if (nextPull <= 65) return FIVE_STAR_BASE_RATE;
    if (nextPull <= 70) return Math.min(0.99, FIVE_STAR_BASE_RATE + 0.04 * (nextPull - 65));
    if (nextPull <= 75) return Math.min(0.99, FIVE_STAR_BASE_RATE + 0.04 * 5 + 0.08 * (nextPull - 70));
    return Math.min(0.99, FIVE_STAR_BASE_RATE + 0.04 * 5 + 0.08 * 5 + 0.10 * (nextPull - 75));
  }

  function fiveStarDrawPmf(startPity, useSoftPity) {
    const pity = clampInteger(startPity, 0, 79);
    const cacheKey = `${pity}:${useSoftPity ? 1 : 0}`;
    if (fiveStarPmfCache.has(cacheKey)) return fiveStarPmfCache.get(cacheKey);
    const maxDraws = MAX_PITY - pity;
    const pmf = new Map();
    let survival = 1;

    for (let draw = 1; draw <= maxDraws; draw += 1) {
      const rate = getFiveStarRate(pity + draw - 1, useSoftPity);
      const probability = survival * rate;
      pmf.set(draw, probability);
      survival *= (1 - rate);
    }

    const normalized = normalizePmf(pmf);
    fiveStarPmfCache.set(cacheKey, normalized);
    return normalized;
  }

  function normalizePmf(pmf) {
    let total = 0;
    for (const probability of pmf.values()) total += probability;
    if (total <= 0) return pmf;

    const normalized = new Map();
    for (const [draws, probability] of pmf.entries()) {
      normalized.set(draws, probability / total);
    }
    return normalized;
  }

  function convolve(a, b) {
    const result = new Map();
    for (const [drawsA, probA] of a.entries()) {
      for (const [drawsB, probB] of b.entries()) {
        const key = drawsA + drawsB;
        result.set(key, (result.get(key) || 0) + probA * probB);
      }
    }
    return result;
  }

  function copyCountDrawPmf(banner, count, startPity, characterGuaranteed, useSoftPity) {
    const normalizedCount = clampInteger(count, 0, 99);
    const normalizedPity = clampInteger(startPity, 0, 79);
    const cacheKey = [
      banner,
      normalizedCount,
      normalizedPity,
      characterGuaranteed ? 1 : 0,
      useSoftPity ? 1 : 0
    ].join(":");
    if (copyCountPmfCache.has(cacheKey)) return copyCountPmfCache.get(cacheKey);
    if (normalizedCount === 0) {
      const empty = new Map([[0, 1]]);
      copyCountPmfCache.set(cacheKey, empty);
      return empty;
    }

    let distribution = new Map([[0, 1]]);
    for (let index = 0; index < normalizedCount; index += 1) {
      const eventPmf = banner === "character"
        ? characterCopyPmf(
            index === 0 ? normalizedPity : 0,
            index === 0 ? characterGuaranteed : false,
            useSoftPity
          )
        : fiveStarDrawPmf(index === 0 ? normalizedPity : 0, useSoftPity);
      distribution = convolve(distribution, eventPmf);
    }

    copyCountPmfCache.set(cacheKey, distribution);
    return distribution;
  }

  function characterCopyPmf(startPity, isGuaranteed, useSoftPity) {
    const cacheKey = `${clampInteger(startPity, 0, 79)}:${isGuaranteed ? 1 : 0}:${useSoftPity ? 1 : 0}`;
    if (characterCopyPmfCache.has(cacheKey)) return characterCopyPmfCache.get(cacheKey);
    const firstFive = fiveStarDrawPmf(startPity, useSoftPity);
    if (isGuaranteed) {
      characterCopyPmfCache.set(cacheKey, firstFive);
      return firstFive;
    }

    const secondFive = fiveStarDrawPmf(0, useSoftPity);
    const offThenUp = convolve(firstFive, secondFive);
    const result = new Map();

    for (const [draws, probability] of firstFive.entries()) {
      result.set(draws, (result.get(draws) || 0) + probability * 0.5);
    }
    for (const [draws, probability] of offThenUp.entries()) {
      result.set(draws, (result.get(draws) || 0) + probability * 0.5);
    }

    const normalized = normalizePmf(result);
    characterCopyPmfCache.set(cacheKey, normalized);
    return normalized;
  }

  function buildSuccessSequence(goal, progress) {
    const charNeed = clampInteger(goal.characterRank, 0, 6) + 1;
    const weaponNeed = clampInteger(goal.weaponCount, 0, 5);
    const sequence = [];
    let charCopies = clampInteger(progress.characterCopies, 0, 99);
    let weaponCopies = clampInteger(progress.weaponCopies, 0, 99);

    while (charCopies < charNeed || weaponCopies < weaponNeed) {
      if (weaponNeed > 0 && charCopies < 1) {
        sequence.push("character");
        charCopies += 1;
      } else if (weaponNeed > 0 && weaponCopies < 1) {
        sequence.push("weapon");
        weaponCopies += 1;
      } else if (charCopies < charNeed) {
        sequence.push("character");
        charCopies += 1;
      } else if (weaponCopies < weaponNeed) {
        sequence.push("weapon");
        weaponCopies += 1;
      }
    }

    return sequence;
  }

  function canPayDraws(charDraws, weaponDraws, resources) {
    const charWaves = Math.max(0, Number(resources.characterWaves) || 0);
    const weaponWaves = Math.max(0, Number(resources.weaponWaves) || 0);
    const astritePulls = toPullsFromAstrites(resources.astrites);
    const sharedPullsNeeded = Math.max(0, charDraws - charWaves) + Math.max(0, weaponDraws - weaponWaves);
    return sharedPullsNeeded <= astritePulls;
  }

  function availablePullSummary(resources) {
    return {
      characterNative: Math.max(0, Number(resources.characterWaves) || 0),
      weaponNative: Math.max(0, Number(resources.weaponWaves) || 0),
      astritePulls: toPullsFromAstrites(resources.astrites),
      totalFlexible: Math.max(0, Number(resources.characterWaves) || 0) +
        Math.max(0, Number(resources.weaponWaves) || 0) +
        toPullsFromAstrites(resources.astrites)
    };
  }

  function calculateCompletionProbability(input) {
    const goal = normalizeGoal(input.goal);
    const bannerState = normalizeBannerState(input.bannerState);
    const progress = normalizeProgress(input.progress);
    const resources = normalizeResources(input.resources);
    const sequence = buildSuccessSequence(goal, progress);
    const characterCopiesNeeded = sequence.filter((banner) => banner === "character").length;
    const weaponCopiesNeeded = sequence.length - characterCopiesNeeded;
    const characterDistribution = copyCountDrawPmf(
      "character",
      characterCopiesNeeded,
      bannerState.characterPity,
      bannerState.characterGuaranteed,
      Boolean(input.useSoftPity)
    );
    const weaponDistribution = copyCountDrawPmf(
      "weapon",
      weaponCopiesNeeded,
      bannerState.weaponPity,
      false,
      Boolean(input.useSoftPity)
    );
    let probability = 0;

    for (const [charDraws, charProbability] of characterDistribution.entries()) {
      for (const [weaponDraws, weaponProbability] of weaponDistribution.entries()) {
        if (canPayDraws(charDraws, weaponDraws, resources)) {
          probability += charProbability * weaponProbability;
        }
      }
    }

    return Math.max(0, Math.min(1, probability));
  }

  function hardPityRequirement(goalInput, bannerStateInput, progressInput) {
    const goal = normalizeGoal(goalInput);
    const state = normalizeBannerState(bannerStateInput);
    const progress = normalizeProgress(progressInput);
    const sequence = buildSuccessSequence(goal, progress);
    let characterPity = state.characterPity;
    let weaponPity = state.weaponPity;
    let characterGuaranteed = state.characterGuaranteed;
    let characterDraws = 0;
    let weaponDraws = 0;
    const expandedSequence = [];

    for (const banner of sequence) {
      if (banner === "character") {
        const draws = characterGuaranteed ? MAX_PITY - characterPity : MAX_PITY - characterPity + MAX_PITY;
        characterDraws += draws;
        for (let i = 0; i < draws; i += 1) expandedSequence.push("character");
        characterPity = 0;
        characterGuaranteed = false;
      } else {
        const draws = MAX_PITY - weaponPity;
        weaponDraws += draws;
        for (let i = 0; i < draws; i += 1) expandedSequence.push("weapon");
        weaponPity = 0;
      }
    }

    return {
      characterDraws,
      weaponDraws,
      totalDraws: characterDraws + weaponDraws,
      sequence,
      expandedSequence
    };
  }

  function missingForHardPity(goal, bannerState, progress, resourcesInput) {
    const resources = normalizeResources(resourcesInput);
    const requirement = hardPityRequirement(goal, bannerState, progress);
    let characterWaves = resources.characterWaves;
    let weaponWaves = resources.weaponWaves;
    let astritePulls = toPullsFromAstrites(resources.astrites);
    let missingCharacter = 0;
    let missingWeapon = 0;

    for (const banner of requirement.expandedSequence) {
      if (banner === "character") {
        if (characterWaves > 0) characterWaves -= 1;
        else if (astritePulls > 0) astritePulls -= 1;
        else missingCharacter += 1;
      } else {
        if (weaponWaves > 0) weaponWaves -= 1;
        else if (astritePulls > 0) astritePulls -= 1;
        else missingWeapon += 1;
      }
    }

    return {
      ...requirement,
      missingCharacter,
      missingWeapon,
      missingTotal: missingCharacter + missingWeapon,
      missingAstrites: (missingCharacter + missingWeapon) * ASTRITES_PER_PULL
    };
  }

  function normalizeGoal(goal) {
    return {
      characterRank: clampInteger(goal && goal.characterRank, 0, 6),
      weaponCount: clampInteger(goal && goal.weaponCount, 0, 5)
    };
  }

  function normalizeBannerState(state) {
    return {
      characterPity: clampInteger(state && state.characterPity, 0, 79),
      weaponPity: clampInteger(state && state.weaponPity, 0, 79),
      characterGuaranteed: Boolean(state && state.characterGuaranteed)
    };
  }

  function normalizeProgress(progress) {
    return {
      characterCopies: clampInteger(progress && progress.characterCopies, 0, 99),
      weaponCopies: clampInteger(progress && progress.weaponCopies, 0, 99)
    };
  }

  function normalizeResources(resources) {
    return {
      astrites: Math.max(0, Math.floor(Number(resources && resources.astrites) || 0)),
      characterWaves: Math.max(0, Math.floor(Number(resources && resources.characterWaves) || 0)),
      weaponWaves: Math.max(0, Math.floor(Number(resources && resources.weaponWaves) || 0))
    };
  }

  function consumeOnePull(resources, banner) {
    const next = normalizeResources(resources);
    if (banner === "character") {
      if (next.characterWaves > 0) next.characterWaves -= 1;
      else if (next.astrites >= ASTRITES_PER_PULL) next.astrites -= ASTRITES_PER_PULL;
      else return { ok: false, resources: next };
    } else {
      if (next.weaponWaves > 0) next.weaponWaves -= 1;
      else if (next.astrites >= ASTRITES_PER_PULL) next.astrites -= ASTRITES_PER_PULL;
      else return { ok: false, resources: next };
    }
    return { ok: true, resources: next };
  }

  function spendDraws(resourcesInput, banner, draws) {
    let resources = normalizeResources(resourcesInput);
    for (let i = 0; i < draws; i += 1) {
      const consumed = consumeOnePull(resources, banner);
      if (!consumed.ok) {
        return { ok: false, resources: normalizeResources(resourcesInput) };
      }
      resources = consumed.resources;
    }
    return { ok: true, resources };
  }

  function estimateHighestGuaranteedTarget(input) {
    const bannerState = normalizeBannerState(input.bannerState);
    let resources = normalizeResources(input.resources);
    let characterPity = bannerState.characterPity;
    let weaponPity = bannerState.weaponPity;
    let characterGuaranteed = bannerState.characterGuaranteed;
    let characterCopies = 0;
    let weaponCopies = 0;
    const path = buildSuccessSequence(
      { characterRank: 6, weaponCount: 5 },
      { characterCopies: 0, weaponCopies: 0 }
    );

    for (const banner of path) {
      const draws = banner === "character"
        ? (characterGuaranteed ? MAX_PITY - characterPity : MAX_PITY - characterPity + MAX_PITY)
        : MAX_PITY - weaponPity;
      const paid = spendDraws(resources, banner, draws);
      if (!paid.ok) break;

      resources = paid.resources;
      if (banner === "character") {
        characterCopies += 1;
        characterPity = 0;
        characterGuaranteed = false;
      } else {
        weaponCopies += 1;
        weaponPity = 0;
      }
    }

    return {
      characterCopies,
      weaponCopies,
      target: characterCopies > 0
        ? { characterRank: characterCopies - 1, weaponCount: weaponCopies }
        : null,
      resources,
      bannerState: {
        characterPity,
        weaponPity,
        characterGuaranteed
      }
    };
  }

  function validateAndApplyTenPull(session, record) {
    const state = {
      goal: normalizeGoal(session.goal),
      bannerState: normalizeBannerState(session.bannerState),
      resources: normalizeResources(session.resources),
      progress: normalizeProgress(session.progress)
    };
    const banner = record.banner === "weapon" ? "weapon" : "character";
    const rawUpCount = Number(record.upCount);
    const rawOffCount = Number(record.offCount);
    if (!Number.isInteger(rawUpCount) || rawUpCount < 0 || rawUpCount > 10 ||
      !Number.isInteger(rawOffCount) || rawOffCount < 0 || rawOffCount > 10) {
      return { ok: false, error: "五星数量请填写 0 到 10 的整数。", session };
    }
    const upCount = rawUpCount;
    const offCount = banner === "character" ? rawOffCount : 0;
    const totalGolds = upCount + offCount;
    const lastResult = totalGolds === 0 ? "none" : (record.lastResult === "off" ? "off" : "up");
    const remainingPity = Number(record.remainingPity);

    if (!Number.isInteger(remainingPity) || remainingPity < 1 || remainingPity > MAX_PITY) {
      return { ok: false, error: "请填写十连结束后卡池界面显示的距离五星保底抽数。", session };
    }
    if (totalGolds > 10) {
      return { ok: false, error: "一次十连最多记录 10 个五星。", session };
    }
    if (totalGolds === 0 && record.lastResult !== "none") {
      return { ok: false, error: "未记录五星时，请将最后一个五星设为“本次无五星”。", session };
    }
    if (totalGolds > 0 && record.lastResult === "none") {
      return { ok: false, error: "记录五星后，请填写最后一个五星的类型。", session };
    }
    if (lastResult === "up" && upCount === 0) {
      return { ok: false, error: "最后一个五星选择为限定，但限定五星数量为 0。", session };
    }
    if (lastResult === "off" && offCount === 0) {
      return { ok: false, error: "最后一个五星选择为非限定，但非限定五星数量为 0。", session };
    }
    if (banner === "weapon" && (record.lastResult === "off" || Number(record.offCount) > 0)) {
      return { ok: false, error: "限定武器池只会获得限定五星。", session };
    }

    const startingPity = banner === "character" ? state.bannerState.characterPity : state.bannerState.weaponPity;
    const finalPity = MAX_PITY - remainingPity;
    if (totalGolds === 0) {
      const expectedPity = startingPity + 10;
      if (expectedPity >= MAX_PITY) {
        return { ok: false, error: "本次十连已触发硬保底，请记录至少一个五星。", session };
      }
      if (finalPity !== expectedPity) {
        return { ok: false, error: `未记录五星时，十连后距离五星保底应为 ${MAX_PITY - expectedPity} 抽。`, session };
      }
    } else {
      const lastGoldPosition = 10 - finalPity;
      if (finalPity > 9 || totalGolds > lastGoldPosition) {
        return { ok: false, error: "五星数量与十连后的保底距离不匹配，请核对卡池界面信息。", session };
      }
      if (totalGolds === 1 && lastGoldPosition > MAX_PITY - startingPity) {
        return { ok: false, error: "本次硬保底应更早出现五星，请核对十连后的保底距离。", session };
      }
    }
    if (banner === "character") {
      const maxOffCount = state.bannerState.characterGuaranteed ? upCount : upCount + 1;
      if (offCount > maxOffCount) {
        return { ok: false, error: "当前小保底状态下，非限定五星数量无法成立，请核对记录。", session };
      }
    }

    let resources = state.resources;
    for (let i = 0; i < 10; i += 1) {
      const consumed = consumeOnePull(resources, banner);
      if (!consumed.ok) {
        return { ok: false, error: "资源不足，无法记录这次十连。", session };
      }
      resources = consumed.resources;
    }

    let characterPity = state.bannerState.characterPity;
    let weaponPity = state.bannerState.weaponPity;
    let characterGuaranteed = state.bannerState.characterGuaranteed;
    let characterCopies = state.progress.characterCopies;
    let weaponCopies = state.progress.weaponCopies;

    if (banner === "character") {
      characterPity = finalPity;
      characterCopies += upCount;
      characterGuaranteed = lastResult === "off";
    } else {
      weaponPity = finalPity;
      weaponCopies += upCount;
    }

    const nextSession = {
      ...session,
      bannerState: {
        characterPity,
        weaponPity,
        characterGuaranteed
      },
      resources,
      progress: {
        characterCopies,
        weaponCopies
      }
    };

    return { ok: true, session: nextSession };
  }

  const api = {
    ASTRITES_PER_PULL,
    MAX_PITY,
    availablePullSummary,
    buildSuccessSequence,
    calculateCompletionProbability,
    getFiveStarRate,
    hardPityRequirement,
    estimateHighestGuaranteedTarget,
    missingForHardPity,
    normalizeBannerState,
    normalizeGoal,
    normalizeProgress,
    normalizeResources,
    validateAndApplyTenPull
  };

  global.WuwaPlanner = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
