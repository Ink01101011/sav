import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAVCompiler } from "../src/index";

describe("SAVCompiler", () => {
  let sandboxDir = "";

  beforeEach(async () => {
    sandboxDir = await mkdtemp(path.join(tmpdir(), "sav-compiler-test-"));
  });

  afterEach(async () => {
    if (sandboxDir) {
      await rm(sandboxDir, { recursive: true, force: true });
    }
  });

  async function createSourceFile(name: string, content: string): Promise<string> {
    const filePath = path.join(sandboxDir, name);
    await writeFile(filePath, content, "utf8");
    return filePath;
  }

  it("generates validators for supported DTO fields", async () => {
    const filePath = await createSourceFile(
      "create-user.ts",
      `
      export interface CreateUserDTO {
        /** @sav email */
        email: string;

        /** @sav min(18), max(60) */
        age: number;

        /** @sav optional */
        nickname?: string;

        role: 'admin' | 'user';
      }

      interface Helper {
        id: string;
      }
      `,
    );

    const compiler = new SAVCompiler();
    const output = compiler.processFile(filePath);

    expect(output).toContain('import * as v from "valibot";');
    expect(output).toContain("export const CreateUserDTOSchema = v.object({");
    expect(output).toContain("email: v.string([v.email()])");
    expect(output).toContain(
      "age: v.coerce(v.number([v.minValue(18), v.maxValue(60)]), (input) => input === \"\" ? Number.NaN : Number(input))",
    );
    expect(output).toContain("nickname: v.optional(v.string())");
    expect(output).toContain('role: v.picklist(["admin", "user"])');
    expect(output).not.toContain("HelperSchema");
  });

  it("throws when @sav contains an unsupported rule", async () => {
    const filePath = await createSourceFile(
      "invalid-rule.ts",
      `
      export interface InvalidRuleDTO {
        /** @sav notExistingRule */
        email: string;
      }
      `,
    );

    const compiler = new SAVCompiler();

    expect(() => compiler.processFile(filePath)).toThrow(
      /Unsupported @sav rule "notExistingRule"/,
    );
  });

  it("throws when DTO includes unsupported TypeScript types", async () => {
    const filePath = await createSourceFile(
      "invalid-type.ts",
      `
      export interface InvalidTypeDTO {
        tags: string[];
      }
      `,
    );

    const compiler = new SAVCompiler();

    expect(() => compiler.processFile(filePath)).toThrow(
      /Unsupported TypeScript type "string\[\]"/,
    );
  });

  it("processes multiple files while keeping a single valibot import", async () => {
    const fileA = await createSourceFile(
      "a.ts",
      `
      export interface ADTO {
        name: string;
      }
      `,
    );

    const fileB = await createSourceFile(
      "b.ts",
      `
      export interface BDTO {
        active: boolean;
      }
      `,
    );

    const compiler = new SAVCompiler();
    const output = compiler.processFiles([fileA, fileB]);

    const importMatches = output.match(/import \* as v from "valibot";/g) ?? [];

    expect(importMatches).toHaveLength(1);
    expect(output).toContain("export const ADTOSchema = v.object({");
    expect(output).toContain("export const BDTOSchema = v.object({");
  });
});
