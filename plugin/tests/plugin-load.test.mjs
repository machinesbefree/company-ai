import { it } from "node:test";
import assert from "node:assert/strict";

it("built plugin entrypoint is importable", async () => {
  const mod = await import("../dist/index.js");
  assert.ok(mod.default);
  assert.equal(mod.default.id, "company");
  assert.equal(typeof mod.default.register, "function");
});
