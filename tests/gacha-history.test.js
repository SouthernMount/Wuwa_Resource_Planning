const assert = require("assert");
const history = require("../electron/gacha-history");

function encryptForFixture(text) {
  const source = Buffer.from(text, "utf8");
  const encrypted = Buffer.allocUnsafe(source.length);
  for (let index = 0; index < source.length; index += 1) {
    encrypted[index] = source[index] ^ (index % 2 === 0 ? 0xa5 : 0xef);
  }
  return encrypted;
}

{
  const url = "https://api.kurogame.com/aki/gacha/getGachaLog?authkey=temporary&gacha_type=3";
  const urls = history.extractHistoryUrls(encryptForFixture(`prefix {\"url\":\"${url}\"}`));
  assert.deepStrictEqual(urls, [url]);
}

{
  const snapshot = history.deriveSnapshot([
    { qualityLevel: 4, name: "Test", time: "2026-08-06 10:02:00" },
    { qualityLevel: 5, name: "安可", time: "2026-08-06 10:01:00" }
  ], "character");
  assert.strictEqual(snapshot.ok, true);
  assert.strictEqual(snapshot.bannerState.characterPity, 1);
  assert.strictEqual(snapshot.bannerState.characterGuaranteed, true);
}

{
  const snapshot = history.deriveSnapshot([
    { qualityLevel: 3, name: "Test" },
    { qualityLevel: 5, name: "Weapon" }
  ], "weapon");
  assert.strictEqual(snapshot.ok, true);
  assert.strictEqual(snapshot.bannerState.weaponPity, 1);
}

console.log("All gacha history tests passed.");
