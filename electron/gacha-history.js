"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const standardFiveStarCharacters = new Set([
  "\u7ef4\u91cc\u5948",
  "\u5b89\u53ef",
  "\u5361\u5361\u7f57",
  "\u51cc\u9633",
  "\u9274\u5fc3"
]);

const launcherProfiles = [
  ["G152", "C10003", "kr_starter_game.json"],
  ["G153", "C50004", "kr_starter_game.json"]
];

const debugLogRelativePaths = [
  ["Client", "Binaries", "Win64", "ThirdParty", "KrPcSdk_Mainland", "KRSDKRes", "KRSDKWebView", "debug.log"],
  ["Client", "Binaries", "Win64", "ThirdParty", "KrPcSdk_Global", "KRSDKRes", "KRSDKWebView", "debug.log"],
  ["Client", "Saved", "Logs", "Client.log"]
];

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function isStandardFiveStarCharacter(name) {
  return standardFiveStarCharacters.has(normalizeName(name));
}

function xorDecode(buffer, phase = 0) {
  const decoded = Buffer.allocUnsafe(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    decoded[index] = buffer[index] ^ (((index + phase) % 2 === 0) ? 0xa5 : 0xef);
  }
  return decoded.toString("utf8");
}

function decodeLogCandidates(buffer) {
  const offset = Number(buffer.xorOffset) || 0;
  return [
    buffer.toString("utf8"),
    xorDecode(buffer, offset),
    xorDecode(buffer, offset + 1)
  ];
}

function normalizeExtractedUrl(value) {
  return String(value || "")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/["'\\\s]+$/g, "");
}

function extractHistoryUrls(buffer) {
  const found = [];
  const seen = new Set();
  for (const text of decodeLogCandidates(buffer)) {
    const matches = text.match(/https?:\\?\/\\?\/[^\s"']*?(?:getGachaLog|get_gacha_log)[^\s"']*/gi) || [];
    for (const match of matches) {
      const url = normalizeExtractedUrl(match);
      if (!url || seen.has(url)) continue;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || !/(^|\.)kurogame\.com$/i.test(parsed.hostname)) continue;
        seen.add(url);
        found.push(url);
      } catch (_) {
        // Logs frequently contain incomplete request fragments; ignore those safely.
      }
    }
  }
  return found;
}

function readLauncherRoots(appDataPath) {
  const roots = [];
  for (const profile of launcherProfiles) {
    const filePath = path.join(appDataPath, "KRLauncher", ...profile);
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const gamePath = typeof parsed.path === "string" ? parsed.path.trim() : "";
      if (gamePath && fs.existsSync(gamePath)) roots.push(gamePath);
    } catch (_) {
      // A missing launcher profile is normal for players using another region.
    }
  }
  return [...new Set(roots)];
}

function findDebugLogs(gameRoot) {
  if (!gameRoot || !fs.existsSync(gameRoot)) return [];
  return debugLogRelativePaths
    .map((segments) => path.join(gameRoot, ...segments))
    .filter((filePath) => fs.existsSync(filePath));
}

function readRecentLog(filePath, maximumBytes = 8 * 1024 * 1024) {
  const stats = fs.statSync(filePath);
  const length = Math.min(stats.size, maximumBytes);
  const buffer = Buffer.allocUnsafe(length);
  const descriptor = fs.openSync(filePath, "r");
  const start = Math.max(0, stats.size - length);
  try {
    fs.readSync(descriptor, buffer, 0, length, start);
  } finally {
    fs.closeSync(descriptor);
  }
  buffer.xorOffset = start;
  return buffer;
}

function requestJson(urlText) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlText);
    const request = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*"
      },
      timeout: 12000
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`History request failed (${response.statusCode || "unknown"}).`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          reject(new Error("History response was not valid JSON."));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("History request timed out.")));
    request.on("error", reject);
  });
}

function latestHistoryUrl(gameRoots) {
  let latest = null;
  for (const root of gameRoots) {
    for (const logPath of findDebugLogs(root)) {
      try {
        const stats = fs.statSync(logPath);
        const urls = extractHistoryUrls(readRecentLog(logPath));
        for (const url of urls) {
          if (!latest || stats.mtimeMs >= latest.mtimeMs) latest = { url, mtimeMs: stats.mtimeMs, root };
        }
      } catch (_) {
        // A rotating log can change while it is being read; the next poll will retry.
      }
    }
  }
  return latest;
}

function responseRecords(payload) {
  const data = payload && typeof payload === "object" ? (payload.data || payload) : {};
  const list = data && (data.list || data.records || data.items);
  return Array.isArray(list) ? list : [];
}

function normalizeHistoryRecord(record, index) {
  const quality = Number(record.qualityLevel ?? record.quality_level ?? record.quality ?? record.rank);
  return {
    id: String(record.id ?? record.recordId ?? record.resourceId ?? index),
    quality,
    name: String(record.name ?? record.resourceName ?? record.resource_name ?? ""),
    time: String(record.time ?? record.gachaTime ?? record.createdAt ?? ""),
    pool: String(record.cardPoolType ?? record.gachaType ?? record.gacha_type ?? "")
  };
}

function buildFingerprint(records) {
  return records.slice(0, 20)
    .map((record, index) => `${index}:${record.id}:${record.time}:${record.name}:${record.quality}:${record.pool}`)
    .join("|");
}

function deriveSnapshot(rawRecords, banner) {
  const records = rawRecords.map(normalizeHistoryRecord);
  const firstFiveIndex = records.findIndex((record) => record.quality === 5);
  if (firstFiveIndex < 0) {
    return {
      ok: false,
      error: "Recent history did not include a five-star record; open the matching banner history and try again."
    };
  }
  const latestFive = records[firstFiveIndex];
  const characterGuaranteed = banner === "character" && isStandardFiveStarCharacter(latestFive.name);
  return {
    ok: true,
    bannerState: banner === "character"
      ? { characterPity: firstFiveIndex, characterGuaranteed }
      : { weaponPity: firstFiveIndex },
    fingerprint: buildFingerprint(records),
    latestFive: {
      name: latestFive.name,
      time: latestFive.time,
      standard: banner === "character" ? isStandardFiveStarCharacter(latestFive.name) : false
    },
    records: records.slice(0, 100)
  };
}

function withLargePageSize(urlText) {
  const url = new URL(urlText);
  url.searchParams.set("size", "100");
  url.searchParams.delete("begin_id");
  url.searchParams.delete("end_id");
  return url.toString();
}

class GachaHistoryService {
  constructor(appDataPath) {
    this.appDataPath = appDataPath;
    this.gameRoot = "";
    this.urls = new Map();
  }

  setGameRoot(gameRoot) {
    this.gameRoot = gameRoot || "";
  }

  getRoots() {
    return [...new Set([this.gameRoot, ...readLauncherRoots(this.appDataPath)].filter(Boolean))];
  }

  async connect(banner) {
    const normalizedBanner = banner === "weapon" ? "weapon" : "character";
    const found = latestHistoryUrl(this.getRoots());
    if (found) {
      this.urls.set(normalizedBanner, found.url);
      this.gameRoot = found.root;
    }
    const url = this.urls.get(normalizedBanner);
    if (!url) {
      return { ok: false, status: "unavailable", error: "No local gacha-history request was found. Open the matching in-game history tab once, then retry." };
    }
    return this.fetchSnapshot(normalizedBanner, url);
  }

  async fetchSnapshot(banner, url) {
    const payload = await requestJson(withLargePageSize(url));
    const snapshot = deriveSnapshot(responseRecords(payload), banner);
    if (!snapshot.ok) return { ok: false, status: "unavailable", error: snapshot.error };
    return {
      ok: true,
      status: "synced",
      banner,
      bannerState: snapshot.bannerState,
      fingerprint: snapshot.fingerprint,
      latestFive: snapshot.latestFive,
      historyCount: snapshot.records.length
    };
  }
}

module.exports = {
  GachaHistoryService,
  buildFingerprint,
  deriveSnapshot,
  extractHistoryUrls,
  isStandardFiveStarCharacter,
  normalizeHistoryRecord,
  readRecentLog,
  xorDecode
};
