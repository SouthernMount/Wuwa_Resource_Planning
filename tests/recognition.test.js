const assert = require("assert");
const recognition = require("../src/recognition");

{
  assert.strictEqual(recognition.isStandardCharacter("维里奈"), true);
  assert.strictEqual(recognition.isStandardCharacter("今汐"), false);
}

{
  const result = recognition.classifyFiveStarNames(["维里奈", "今汐"], "character");
  assert.strictEqual(result.upCount, 1);
  assert.strictEqual(result.offCount, 1);
  assert.deepStrictEqual(result.offNames, ["维里奈"]);
  assert.deepStrictEqual(result.upNames, ["今汐"]);
}

{
  const result = recognition.classifyFiveStarNames(["维里奈", "今汐"], "weapon");
  assert.strictEqual(result.upCount, 2);
  assert.strictEqual(result.offCount, 0);
}

{
  assert.strictEqual(recognition.parseRemainingPity("距离五星保底 63 抽"), 63);
  assert.strictEqual(recognition.parseRemainingPity("还有12抽必得五星"), 12);
  assert.strictEqual(recognition.parseRemainingPity("无关文本"), null);
}

{
  const detection = recognition.buildDetectedRecord({
    banner: "character",
    resultText: "获得\n维里奈\n今汐",
    pityText: "距离五星保底 78 抽"
  });
  assert.strictEqual(detection.ok, true);
  assert.strictEqual(detection.needsConfirmation, true);
  assert.strictEqual(detection.record.upCount, 1);
  assert.strictEqual(detection.record.offCount, 1);
  assert.strictEqual(detection.record.lastResult, null);
}

{
  const detection = recognition.buildDetectedRecord({
    banner: "weapon",
    resultText: "获得\n时和岁稔\n时和岁稔",
    pityText: "距离五星保底 76 抽"
  });
  assert.strictEqual(detection.ok, true);
  assert.strictEqual(detection.needsConfirmation, false);
  assert.strictEqual(detection.record.upCount, 2);
  assert.strictEqual(detection.record.offCount, 0);
  assert.strictEqual(detection.record.lastResult, "up");
}

console.log("All recognition tests passed.");
