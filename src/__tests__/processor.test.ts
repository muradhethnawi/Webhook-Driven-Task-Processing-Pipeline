import { processAction } from "../services/processor";

describe("transform", () => {
  it("renames a field", () => {
    const r = processAction("transform", { operations: [{ op: "rename", field: "old", newField: "new" }] }, { old: "val" });
    expect(r.data["new"]).toBe("val");
    expect(r.data["old"]).toBeUndefined();
  });
  it("deletes a field", () => {
    const r = processAction("transform", { operations: [{ op: "delete", field: "x" }] }, { x: 1, y: 2 });
    expect(r.data["x"]).toBeUndefined();
  });
  it("sets a value", () => {
    const r = processAction("transform", { operations: [{ op: "set", field: "env", value: "prod" }] }, {});
    expect(r.data["env"]).toBe("prod");
  });
});

describe("filter", () => {
  it("passes on eq match", () => {
    const r = processAction("filter", { field: "event", operator: "eq", value: "purchase" }, { event: "purchase" });
    expect(r.passed).toBe(true);
  });
  it("blocks on eq mismatch", () => {
    const r = processAction("filter", { field: "event", operator: "eq", value: "purchase" }, { event: "signup" });
    expect(r.passed).toBe(false);
  });
  it("contains operator", () => {
    const r = processAction("filter", { field: "msg", operator: "contains", value: "error" }, { msg: "an error occurred" });
    expect(r.passed).toBe(true);
  });
  it("exists operator", () => {
    const r = processAction("filter", { field: "userId", operator: "exists" }, { userId: "123" });
    expect(r.passed).toBe(true);
  });
});

describe("enrich", () => {
  it("adds fields", () => {
    const r = processAction("enrich", { fields: { v: "1.0" } }, { event: "click" });
    expect(r.data["v"]).toBe("1.0");
    expect(r.data["_enriched_at"]).toBeDefined();
  });
});

describe("delay", () => {
  it("passes through", () => {
    const r = processAction("delay", { delayMs: 5000 }, { event: "test" });
    expect(r.passed).toBe(true);
  });
});
