import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, DEFAULT_STATE_DIR } from "../dist/src/config.js";

describe("parseConfig", () => {
  it("returns defaults for invalid input", () => {
    const config = parseConfig(null);
    assert.equal(config.stateDir, DEFAULT_STATE_DIR);
    assert.deepStrictEqual(config.agents, {});
  });

  it("parses agent inject sections and deduplicates", () => {
    const config = parseConfig({
      agents: {
        ceo: { inject: ["finance", "finance", "strategy", "queue", "bogus"] },
        "vp-finance": { inject: ["finance", "risks"] },
      },
    });
    assert.deepStrictEqual(config.agents.ceo.inject, ["finance", "strategy", "queue"]);
    assert.deepStrictEqual(config.agents["vp-finance"].inject, ["finance", "risks"]);
    assert.ok(config.agents.ceo.enabled);
  });

  it("respects enabled: false", () => {
    const config = parseConfig({
      agents: { ceo: { enabled: false } },
    });
    assert.equal(config.agents.ceo.enabled, false);
  });
});
