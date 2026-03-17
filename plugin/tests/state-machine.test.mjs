import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCompanyState,
  createDefaultCompanyState,
  CompanyStateManager,
  COMPANY_SECTIONS,
  COMPANY_STATE_VERSION,
  MAX_RESOLVED_KEPT,
  isCompanySection,
} from "../dist/src/state-machine.js";

describe("normalizeCompanyState", () => {
  it("returns defaults for invalid input", () => {
    const state = normalizeCompanyState(null);
    assert.equal(state.version, COMPANY_STATE_VERSION);
    assert.equal(state.ceo.focus, "initializing");
    assert.deepStrictEqual(state.ceo.goals, []);
    assert.equal(state.finance.runway_months, 0);
    assert.equal(state.finance.report, "No report yet.");
    assert.equal(state.finance.attention, "none");
    assert.deepStrictEqual(state.operations.active_projects, []);
    assert.equal(state.risks.risk_level, "unknown");
    assert.equal(state.queue.pending_count, 0);
    assert.deepStrictEqual(state.queue.decisions, []);
    assert.equal(state.meta.company_name, "");
    assert.deepStrictEqual(state.meta.roles, []);
  });

  it("clamps numeric fields to minimum 0", () => {
    const state = normalizeCompanyState({
      finance: { runway_months: -5, monthly_burn: -100 },
      operations: { headcount: -3 },
      queue: { pending_count: -1 },
    });
    assert.equal(state.finance.runway_months, 0);
    assert.equal(state.finance.monthly_burn, 0);
    assert.equal(state.operations.headcount, 0);
    assert.equal(state.queue.pending_count, 0);
  });

  it("normalizes string arrays", () => {
    const state = normalizeCompanyState({
      strategy: { current_priorities: ["growth", 42, "", "  retention  "] },
      queue: { pending_summaries: ["item 1", "item 2"] },
      ceo: { goals: ["close Series A", "", "  ship mobile v2  "] },
    });
    assert.deepStrictEqual(state.strategy.current_priorities, ["growth", "retention"]);
    assert.deepStrictEqual(state.queue.pending_summaries, ["item 1", "item 2"]);
    assert.deepStrictEqual(state.ceo.goals, ["close Series A", "ship mobile v2"]);
  });

  it("preserves narrative and attention fields", () => {
    const state = normalizeCompanyState({
      finance: {
        attention: "high",
        report: "Burn is stable.",
        needs: "Approve vendor renegotiation",
        report_file: "~/workspace/monthly.md",
      },
      operations: { attention: "urgent" },
    });
    assert.equal(state.finance.attention, "high");
    assert.equal(state.finance.report, "Burn is stable.");
    assert.equal(state.operations.attention, "urgent");
  });

  it("normalizes decisions array", () => {
    const state = normalizeCompanyState({
      queue: {
        decisions: [
          { id: "dec_1", summary: "Hire VP Eng", source: "CEO", requires_human: true },
          { id: "", summary: "bad" }, // invalid — no id
          { id: "dec_2", summary: "Buy tool", source: "VP Product", status: "approved" },
        ],
      },
    });
    assert.equal(state.queue.decisions.length, 2);
    assert.equal(state.queue.decisions[0].id, "dec_1");
    assert.equal(state.queue.decisions[0].status, "pending");
    assert.equal(state.queue.decisions[1].status, "approved");
  });

  it("normalizes meta section with roles", () => {
    const state = normalizeCompanyState({
      meta: {
        company_name: "Acme Corp",
        domain: "B2B SaaS",
        roles: [
          { role: "ceo", type: "ai", agentId: "ceo", displayName: "CEO" },
          { role: "vp-product", type: "human", telegramChatId: "123", displayName: "Alice" },
          { role: "" }, // invalid
        ],
        voice_enabled: true,
      },
    });
    assert.equal(state.meta.company_name, "Acme Corp");
    assert.equal(state.meta.roles.length, 2);
    assert.equal(state.meta.roles[0].type, "ai");
    assert.equal(state.meta.roles[1].type, "human");
    assert.equal(state.meta.voice_enabled, true);
  });
});

describe("CompanyStateManager", () => {
  it("CEO section tracks focus and goals", () => {
    const manager = new CompanyStateManager();
    manager.updateSection("ceo", {
      focus: "closing Series A",
      goals: ["finalize term sheet", "hire VP Eng", "ship mobile beta"],
      current_priority: "Series A term sheet",
      next_action: "Review VP Finance's funding model",
      note_to_self: "Investor meeting Thursday — prep deck with VP Product",
    });
    const ceo = manager.getSection("ceo");
    assert.equal(ceo.focus, "closing Series A");
    assert.deepStrictEqual(ceo.goals, ["finalize term sheet", "hire VP Eng", "ship mobile beta"]);
    assert.equal(ceo.current_priority, "Series A term sheet");
    assert.equal(ceo.blocked_on, "none"); // default preserved
  });

  it("VP attention updates independently of metrics", () => {
    const manager = new CompanyStateManager();
    manager.updateSection("operations", {
      attention: "high",
      report: "API latency critical — need 2hr eng allocation now.",
      needs: "Approve eng allocation",
    });
    const ops = manager.getSection("operations");
    assert.equal(ops.attention, "high");
    assert.equal(ops.system_health, "unknown"); // metric unchanged
  });

  it("partial updates preserve other fields", () => {
    const manager = new CompanyStateManager();
    manager.updateSection("finance", { runway_months: 18, monthly_burn: 50000 });
    const finance = manager.getSection("finance");
    assert.equal(finance.runway_months, 18);
    assert.equal(finance.burn_trend, "unknown");
    assert.equal(finance.attention, "none");
    assert.equal(finance.report, "No report yet.");
  });

  it("fires change handler on update", () => {
    const manager = new CompanyStateManager();
    let called = false;
    manager.setChangeHandler(() => { called = true; });
    manager.updateSection("ceo", { focus: "hiring" });
    assert.ok(called);
  });

  it("returns cloned state (mutations don't leak)", () => {
    const manager = new CompanyStateManager();
    const state1 = manager.getState();
    state1.ceo.goals.push("leaked");
    state1.operations.active_projects.push("leaked");
    state1.queue.pending_summaries.push("leaked");
    const state2 = manager.getState();
    assert.deepStrictEqual(state2.ceo.goals, []);
    assert.deepStrictEqual(state2.operations.active_projects, []);
    assert.deepStrictEqual(state2.queue.pending_summaries, []);
  });

  it("addDecision auto-generates ID and creates pending decision", () => {
    const manager = new CompanyStateManager();
    const decision = manager.addDecision({
      summary: "Launch beta to 500 users",
      source: "VP Product",
      requires_human: true,
    });
    assert.ok(decision.id.startsWith("dec_"), "should auto-generate dec_ prefixed ID");
    assert.equal(decision.status, "pending");
    const queue = manager.getSection("queue");
    assert.equal(queue.pending_count, 1);
    assert.equal(queue.decisions.length, 1);
    assert.deepStrictEqual(queue.awaiting_human, ["[VP Product] Launch beta to 500 users"]);
  });

  it("addDecision accepts caller-provided ID", () => {
    const manager = new CompanyStateManager();
    const decision = manager.addDecision({
      id: "custom_id",
      summary: "Custom",
      source: "CEO",
      requires_human: false,
    });
    assert.equal(decision.id, "custom_id");
  });

  it("addDecision rejects duplicate IDs", () => {
    const manager = new CompanyStateManager();
    manager.addDecision({ id: "dup", summary: "First", source: "VP Product", requires_human: false });
    assert.throws(
      () => manager.addDecision({ id: "dup", summary: "Second", source: "VP Eng", requires_human: false }),
      /Duplicate decision ID: dup/,
    );
  });

  it("resolveDecision updates status and last_decision fields", () => {
    const manager = new CompanyStateManager();
    const dec = manager.addDecision({ summary: "Buy tool", source: "VP Eng", requires_human: false });
    const resolved = manager.resolveDecision(dec.id, "approved", "CEO");
    assert.equal(resolved.status, "approved");
    const queue = manager.getSection("queue");
    assert.equal(queue.pending_count, 0);
    assert.equal(queue.last_decision, "Buy tool");
    assert.equal(queue.last_decision_by, "CEO");
  });

  it("resolveDecision returns null for unknown id", () => {
    const manager = new CompanyStateManager();
    const result = manager.resolveDecision("nonexistent", "approved", "CEO");
    assert.equal(result, null);
  });

  it("updateSection records sectionUpdatedAt timestamp", () => {
    const manager = new CompanyStateManager();
    const before = Date.now();
    manager.updateSection("finance", { runway_months: 12 });
    const state = manager.getState();
    assert.ok(state.sectionUpdatedAt.finance >= before);
    assert.equal(state.sectionUpdatedAt.ceo, undefined); // untouched section has no timestamp
  });

  it("resolveDecision prunes old resolved decisions beyond MAX_RESOLVED_KEPT", () => {
    const manager = new CompanyStateManager();
    // Add MAX_RESOLVED_KEPT + 5 decisions, resolve them all
    const ids = [];
    for (let i = 0; i < MAX_RESOLVED_KEPT + 5; i++) {
      const d = manager.addDecision({ summary: `Decision ${i}`, source: "VP", requires_human: false });
      ids.push(d.id);
    }
    // Resolve all
    for (const id of ids) {
      manager.resolveDecision(id, "approved", "CEO");
    }
    const queue = manager.getSection("queue");
    // Should have pruned to MAX_RESOLVED_KEPT
    assert.equal(queue.decisions.length, MAX_RESOLVED_KEPT);
    // First 5 should be pruned — oldest resolved are removed
    assert.ok(!queue.decisions.some((d) => d.id === ids[0]));
    // Last one should still be there
    assert.ok(queue.decisions.some((d) => d.id === ids[ids.length - 1]));
  });
});

describe("isCompanySection", () => {
  it("accepts valid sections including ceo, queue, and meta", () => {
    for (const s of COMPANY_SECTIONS) {
      assert.ok(isCompanySection(s));
    }
    assert.ok(isCompanySection("ceo"));
    assert.ok(isCompanySection("queue"));
    assert.ok(isCompanySection("meta"));
  });

  it("rejects invalid sections", () => {
    assert.ok(!isCompanySection("bogus"));
    assert.ok(!isCompanySection(""));
  });
});
