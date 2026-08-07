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
  const detection = recognition.buildObservedRecord({
    banner: "character",
    resultText: "获得\n维里奈\n今汐"
  });
  assert.strictEqual(detection.ok, true);
  assert.strictEqual(detection.needsConfirmation, true);
  assert.strictEqual(detection.record.upCount, 1);
  assert.strictEqual(detection.record.offCount, 1);
  assert.strictEqual(detection.record.lastResult, null);
}

{
  const detection = recognition.buildObservedRecord({
    banner: "weapon",
    resultText: "获得\n五星\n时和岁稔\n时和岁稔"
  });
  assert.strictEqual(detection.ok, true);
  assert.strictEqual(detection.needsConfirmation, false);
  assert.strictEqual(detection.record.upCount, 2);
  assert.strictEqual(detection.record.offCount, 0);
  assert.strictEqual(detection.record.lastResult, "up");
}

{
  assert.strictEqual(recognition.detectScene("确认"), "unknown");
  assert.strictEqual(recognition.detectScene("调谐获得跳过"), "result");
  const detection = recognition.buildObservedRecord({ banner: "character", resultText: "获得\n确认" });
  assert.strictEqual(detection.ok, false);
}

console.log("All recognition tests passed.");
