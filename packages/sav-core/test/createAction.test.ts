import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";

import { createAction } from "../src/index";

describe("createAction", () => {
  it("validates and coerces JSON-like payloads before calling action", async () => {
    const schema = v.object({
      email: v.string([v.email()]),
      age: v.coerce(v.number([v.minValue(18)]), (input) => Number(input)),
    });

    const action = vi.fn(async (data: v.Output<typeof schema>) => {
      return { normalized: data };
    });

    const handler = createAction(schema, action);
    const result = await handler({ email: "dev@sav.dev", age: "25" });

    expect(action).toHaveBeenCalledWith({ email: "dev@sav.dev", age: 25 });
    expect(result).toEqual({
      success: true,
      data: {
        normalized: { email: "dev@sav.dev", age: 25 },
      },
    });
  });

  it("maps validation issues back into field-keyed errors", async () => {
    const schema = v.object({
      email: v.string([v.email()]),
      age: v.coerce(v.number(), (input) => Number(input)),
    });

    const handler = createAction(schema, async () => ({ ok: true }));

    const formData = new FormData();
    formData.set("email", "invalid-email");
    formData.set("age", "not-a-number");

    const result = await handler(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.email?.[0]).toBeDefined();
      expect(result.errors.age?.[0]).toBeDefined();
    }
  });

  it("preserves repeated FormData fields as arrays", async () => {
    const schema = v.object({
      tags: v.array(v.string()),
    });

    const handler = createAction(schema, async (data) => data.tags);

    const formData = new FormData();
    formData.append("tags", "alpha");
    formData.append("tags", "beta");

    const result = await handler(formData);

    expect(result).toEqual({
      success: true,
      data: ["alpha", "beta"],
    });
  });

  it("returns a server error payload when action throws", async () => {
    const schema = v.object({
      name: v.string(),
    });

    const handler = createAction(schema, async () => {
      throw new Error("db down");
    });

    const result = await handler({ name: "demo" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors._server).toEqual(["Internal Server Error"]);
    }
  });
});
