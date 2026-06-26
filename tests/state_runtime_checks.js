const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { XrayStateStore } = require("/app/dist/xrayState.js");

const dataDir = mkdtempSync(path.join(os.tmpdir(), "kvpn-state-"));
const createdAt = new Date(0).toISOString();
const state = {
  version: 1,
  server: {
    sni: "www.cloudflare.com",
    privateKey: "KBCKRvj7Plh50R2Ix-Cj3_hpGGpNDoPDXlBMbMAmMks",
    publicKey: "RbW04-z78hLbZOV4bjLkWqSRUJ1llV5tX3nMBve5IUg",
    shortId: "ff27ef1f481793e0",
    publicHost: "72.56.95.233",
  },
  keys: [
    {
      id: "34d284f4-7209-4bd3-aae1-1dd46aa92c5f",
      email: "key-c293ebcb",
      comment: "old",
      enabled: true,
      createdAt,
      updatedAt: createdAt,
      totalUplink: 0,
      totalDownlink: 0,
      lastRuntimeUplink: 0,
      lastRuntimeDownlink: 0,
    },
  ],
};

writeFileSync(path.join(dataDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);

const store = new XrayStateStore(dataDir, "72.56.95.233", "www.cloudflare.com");
const configPath = path.join(dataDir, "xray/config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

assert.deepEqual(config.api.services.sort(), ["HandlerService", "StatsService"].sort());

const oldTime = new Date("2001-01-01T00:00:00Z");
utimesSync(configPath, oldTime, oldTime);
const beforeMtime = statSync(configPath).mtimeMs;

store.updateKey("34d284f4-7209-4bd3-aae1-1dd46aa92c5f", "new comment");

assert.equal(statSync(configPath).mtimeMs, beforeMtime, "comment updates must not rewrite Xray config");
