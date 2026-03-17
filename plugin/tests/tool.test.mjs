import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CompanyStateManager } from "../dist/src/state-machine.js";
import { registerCompanyTool } from "../dist/src/tool.js";

function createMockApi() {
  let registeredTool = null;
  return {
    registered: () => registeredTool,
    registerTool(factory, opts) {
      const tool = factory({});
      registeredTool = { tool, opts };
    },
  };
}

describe("registerCompanyTool", () => {
  it("registers as optional", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    assert.ok(api.registered().opts.optional);
  });

  it("get returns structured content synchronously", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    const result = api.registered().tool.execute("t1", { action: "get", section: "finance" });
    // Must be a plain object, not a Promise — critical for backwards compat
    assert.equal(typeof result.then, "undefined", "get should return synchronously, not a Promise");
    assert.equal(result.content[0].type, "text");
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(typeof parsed.runway_months, "number");
  });

  it("update modifies state synchronously", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    const result = api.registered().tool.execute("t1", {
      action: "update",
      section: "finance",
      runway_months: 24,
    });
    assert.equal(typeof result.then, "undefined", "update should return synchronously, not a Promise");
    assert.equal(manager.getSection("finance").runway_months, 24);
  });

  it("returns error for unknown section synchronously", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    const result = api.registered().tool.execute("t1", { action: "get", section: "bogus" });
    assert.equal(typeof result.then, "undefined", "error should return synchronously");
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error);
  });

  it("add_decision auto-generates ID synchronously (no telegram)", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    const result = api.registered().tool.execute("t1", {
      action: "add_decision",
      summary: "Test decision",
      source: "VP Product",
      requires_human: false,
    });
    assert.equal(typeof result.then, "undefined", "add_decision without telegram should be sync");
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.decision.id.startsWith("dec_"), "should auto-generate ID");
    assert.equal(parsed.decision.status, "pending");
    assert.equal(manager.getSection("queue").pending_count, 1);
  });

  it("add_decision returns error on duplicate ID", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    api.registered().tool.execute("t1", {
      action: "add_decision",
      id: "dup_id",
      summary: "First",
      source: "VP Product",
    });
    const result = api.registered().tool.execute("t1", {
      action: "add_decision",
      id: "dup_id",
      summary: "Second",
      source: "VP Eng",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error);
    assert.match(parsed.error, /Duplicate/);
  });

  it("resolve_decision resolves by id synchronously", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    const addResult = api.registered().tool.execute("t1", {
      action: "add_decision",
      summary: "Resolve me",
      source: "VP Eng",
    });
    const decId = JSON.parse(addResult.content[0].text).decision.id;
    const result = api.registered().tool.execute("t1", {
      action: "resolve_decision",
      id: decId,
      status: "approved",
      decided_by: "Human",
    });
    assert.equal(typeof result.then, "undefined", "resolve_decision should be sync");
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.decision.status, "approved");
    assert.equal(manager.getSection("queue").pending_count, 0);
    assert.equal(manager.getSection("queue").last_decision_by, "Human");
  });

  it("blocks writes to protected meta fields", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    // Try to overwrite company_name — should be filtered out
    const result = api.registered().tool.execute("t1", {
      action: "update",
      section: "meta",
      company_name: "Evil Corp",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error, "should reject protected field");
    assert.equal(manager.getSection("meta").company_name, ""); // unchanged
  });

  it("allows writes to unprotected meta fields", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    const result = api.registered().tool.execute("t1", {
      action: "update",
      section: "meta",
      first_boot_complete: true,
      dashboard_url: "https://dash.example.com",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(!parsed.error);
    const meta = manager.getSection("meta");
    assert.equal(meta.first_boot_complete, true);
    assert.equal(meta.dashboard_url, "https://dash.example.com");
  });

  it("resolve_decision returns error for unknown id", () => {
    const api = createMockApi();
    const manager = new CompanyStateManager();
    registerCompanyTool(api, manager);
    const result = api.registered().tool.execute("t1", {
      action: "resolve_decision",
      id: "nonexistent",
      status: "approved",
    });
    assert.equal(typeof result.then, "undefined");
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error);
  });
});
