const assert = require("assert");
const engine = require("../src/engine");

function approxEqual(actual, expected, tolerance = 1e-9) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} !== ${expected}`);
}

function baseInput(overrides = {}) {
  return {
    goal: { characterRank: 0, weaponCount: 1 },
    bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
    resources: { astrites: 0, characterWaves: 0, weaponWaves: 0 },
    progress: { characterCopies: 0, weaponCopies: 0 },
    useSoftPity: false,
    ...overrides
  };
}

function compactSequence(sequence) {
  const groups = [];
  for (const banner of sequence) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.banner === banner) lastGroup.count += 1;
    else groups.push({ banner, count: 1 });
  }
  return groups;
}

{
  const sequence = engine.buildSuccessSequence(
    { characterRank: 3, weaponCount: 1 },
    { characterCopies: 0, weaponCopies: 0 }
  );
  assert.deepStrictEqual(sequence, ["character", "weapon", "character", "character", "character"]);
}

{
  const sequence = engine.buildSuccessSequence(
    { characterRank: 6, weaponCount: 5 },
    { characterCopies: 0, weaponCopies: 0 }
  );
  assert.deepStrictEqual(compactSequence(sequence), [
    { banner: "character", count: 1 },
    { banner: "weapon", count: 1 },
    { banner: "character", count: 6 },
    { banner: "weapon", count: 4 }
  ]);
}

{
  const missing = engine.missingForHardPity(
    { characterRank: 0, weaponCount: 1 },
    { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
    { characterCopies: 0, weaponCopies: 0 },
    { astrites: 0, characterWaves: 0, weaponWaves: 0 }
  );
  assert.strictEqual(missing.characterDraws, 160);
  assert.strictEqual(missing.weaponDraws, 80);
  assert.strictEqual(missing.missingTotal, 240);
  assert.strictEqual(missing.missingAstrites, 38400);
}

{
  const missing = engine.missingForHardPity(
    { characterRank: 0, weaponCount: 1 },
    { characterPity: 40, weaponPity: 70, characterGuaranteed: true },
    { characterCopies: 0, weaponCopies: 0 },
    { astrites: 1600, characterWaves: 20, weaponWaves: 0 }
  );
  assert.strictEqual(missing.characterDraws, 40);
  assert.strictEqual(missing.weaponDraws, 10);
  assert.strictEqual(missing.missingTotal, 20);
}

{
  const probability = engine.calculateCompletionProbability(baseInput({
    goal: { characterRank: 0, weaponCount: 0 },
    bannerState: { characterPity: 79, weaponPity: 0, characterGuaranteed: true },
    resources: { astrites: 0, characterWaves: 1, weaponWaves: 0 }
  }));
  approxEqual(probability, 1);
}

{
  const probability = engine.calculateCompletionProbability(baseInput({
    goal: { characterRank: 0, weaponCount: 0 },
    bannerState: { characterPity: 79, weaponPity: 0, characterGuaranteed: false },
    resources: { astrites: 0, characterWaves: 1, weaponWaves: 0 }
  }));
  approxEqual(probability, 0.5);
}

{
  const session = {
    goal: { characterRank: 0, weaponCount: 1 },
    bannerState: { characterPity: 78, weaponPity: 0, characterGuaranteed: false },
    resources: { astrites: 0, characterWaves: 10, weaponWaves: 10 },
    progress: { characterCopies: 0, weaponCopies: 0 }
  };
  const result = engine.validateAndApplyTenPull(session, {
    banner: "character",
    upCount: 1,
    offCount: 1,
    lastResult: "up",
    remainingPity: 74
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.session.progress.characterCopies, 1);
  assert.strictEqual(result.session.bannerState.characterGuaranteed, false);
  assert.strictEqual(result.session.bannerState.characterPity, 6);
  assert.strictEqual(result.session.resources.characterWaves, 0);
}

{
  const session = {
    goal: { characterRank: 0, weaponCount: 0 },
    bannerState: { characterPity: 79, weaponPity: 0, characterGuaranteed: false },
    resources: { astrites: 0, characterWaves: 10, weaponWaves: 0 },
    progress: { characterCopies: 0, weaponCopies: 0 }
  };
  const result = engine.validateAndApplyTenPull(session, {
    banner: "character",
    upCount: 0,
    offCount: 0,
    lastResult: "none",
    remainingPity: 1
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /硬保底/);
}

{
  const session = {
    goal: { characterRank: 0, weaponCount: 0 },
    bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: true },
    resources: { astrites: 0, characterWaves: 10, weaponWaves: 0 },
    progress: { characterCopies: 0, weaponCopies: 0 }
  };
  const result = engine.validateAndApplyTenPull(session, {
    banner: "character",
    upCount: 0,
    offCount: 1,
    lastResult: "off",
    remainingPity: 80
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /非限定五星数量/);
}

{
  const session = {
    goal: { characterRank: 1, weaponCount: 0 },
    bannerState: { characterPity: 70, weaponPity: 0, characterGuaranteed: true },
    resources: { astrites: 0, characterWaves: 10, weaponWaves: 0 },
    progress: { characterCopies: 0, weaponCopies: 0 }
  };
  const result = engine.validateAndApplyTenPull(session, {
    banner: "character",
    upCount: 1,
    offCount: 1,
    lastResult: "off",
    remainingPity: 80
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.session.progress.characterCopies, 1);
  assert.strictEqual(result.session.bannerState.characterPity, 0);
  assert.strictEqual(result.session.bannerState.characterGuaranteed, true);
}

{
  const session = {
    goal: { characterRank: 0, weaponCount: 1 },
    bannerState: { characterPity: 0, weaponPity: 40, characterGuaranteed: false },
    resources: { astrites: 0, characterWaves: 0, weaponWaves: 10 },
    progress: { characterCopies: 0, weaponCopies: 0 }
  };
  const result = engine.validateAndApplyTenPull(session, {
    banner: "weapon",
    upCount: 2,
    offCount: 0,
    lastResult: "up",
    remainingPity: 76
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.session.progress.weaponCopies, 2);
  assert.strictEqual(result.session.bannerState.weaponPity, 4);
}

{
  const estimate = engine.estimateHighestGuaranteedTarget({
    bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: true },
    resources: { astrites: 0, characterWaves: 80, weaponWaves: 0 }
  });
  assert.deepStrictEqual(estimate.target, { characterRank: 0, weaponCount: 0 });
  assert.strictEqual(estimate.resources.astrites, 0);
}

{
  const estimate = engine.estimateHighestGuaranteedTarget({
    bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
    resources: { astrites: 0, characterWaves: 160, weaponWaves: 80 }
  });
  assert.deepStrictEqual(estimate.target, { characterRank: 0, weaponCount: 1 });
}

{
  const estimate = engine.estimateHighestGuaranteedTarget({
    bannerState: { characterPity: 0, weaponPity: 0, characterGuaranteed: false },
    resources: { astrites: 159 * 160, characterWaves: 0, weaponWaves: 0 }
  });
  assert.strictEqual(estimate.target, null);
}

console.log("All probability tests passed.");
