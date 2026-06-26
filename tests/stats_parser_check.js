const assert = require("node:assert/strict");

const { parseStatsOutput } = require("/app/dist/xrayState.js");

assert.equal(typeof parseStatsOutput, "function", "parseStatsOutput must be exported for regression coverage");

const stats = parseStatsOutput(`{
  "stat": [
    {
      "name": "user>>>main>>>traffic>>>uplink",
      "value": 4856
    },
    {
      "name": "user>>>main>>>traffic>>>downlink",
      "value": 1026
    }
  ]
}`);

assert.equal(stats.get("user>>>main>>>traffic>>>uplink"), 4856);
assert.equal(stats.get("user>>>main>>>traffic>>>downlink"), 1026);
