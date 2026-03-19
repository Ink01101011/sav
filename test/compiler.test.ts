import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAVCompiler } from "../src/compiler/index";

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
      "age: v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number([v.minValue(18), v.maxValue(60)]))",
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

  it("supports common structural TypeScript types with DTO references", async () => {
    const filePath = await createSourceFile(
      "structural-types.ts",
      `
      export interface StructuralTypesDTO {
        tags: string[];
        pair: [string, number];
        scores: Record<string, number>;
        ids: Set<number>;
        byId: Map<string, number>;
      }
      `,
    );

    const compiler = new SAVCompiler();
    const output = compiler.processFile(filePath);

    expect(output).toContain("export const StructuralTypesDTOSchema = v.object({");
    expect(output).toContain("tags: v.array(v.string())");
    expect(output).toContain(
      "pair: v.tuple([v.string(), v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number())])",
    );
    expect(output).toContain(
      "scores: v.record(v.string(), v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number()))",
    );
    expect(output).toContain(
      "ids: v.set(v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number()))",
    );
    expect(output).toContain(
      "byId: v.map(v.string(), v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number()))",
    );
  });


  it("supports common structural TypeScript types", async () => {
    const filePath = await createSourceFile(
      "structural-types.ts",
      `
      export interface StructuralTypesDTO {
        tags: string[];
        pair: [string, number];
        scores: Record<string, number>;
        ids: Set<number>;
        byId: Map<string, number>;
        employee: EmployeeDTO;
      }
      
      export interface EmployeeDTO {
        employeeId: number;
      }
      `,
    );

    const compiler = new SAVCompiler();
    const output = compiler.processFile(filePath);

    expect(output).toContain("export const StructuralTypesDTOSchema = v.object({");
    expect(output).toContain("tags: v.array(v.string())");
    expect(output).toContain(
      "pair: v.tuple([v.string(), v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number())])",
    );
    expect(output).toContain(
      "scores: v.record(v.string(), v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number()))",
    );
    expect(output).toContain(
      "ids: v.set(v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number()))",
    );
    expect(output).toContain(
      "byId: v.map(v.string(), v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number()))",
    );

    expect(output).toContain("employee: EmployeeDTOSchema");

    expect(output).toContain("export const EmployeeDTOSchema = v.object({");
  });

  it("normalizes imported DTO references from ts-morph type text", async () => {
    const sourcePath = await createSourceFile(
      "source.ts",
      `
      import type { EmployeeDTO } from "./employee";

      export interface CompanyDTO {
        employee: EmployeeDTO;
      }
      `,
    );

    const employeePath = await createSourceFile(
      "employee.ts",
      `
      export interface EmployeeDTO {
        employeeId: number;
      }
      `,
    );

    const compiler = new SAVCompiler();
    const output = compiler.processFiles([sourcePath, employeePath]);

    expect(output).toContain("employee: EmployeeDTOSchema");
    expect(output).not.toContain("import(\"");
    expect(output).toContain("export const EmployeeDTOSchema = v.object({");
  });

  it("creates schema modules with imports when a file has related DTOs", async () => {
    const filePath = await createSourceFile(
      "multi-dto.ts",
      `
      export interface AddressDTO {
        street: string;
      }

      export interface ProfileDTO {
        name: string;
        address: AddressDTO;
      }
      `,
    );

    const compiler = new SAVCompiler();
    const modules = compiler.processFileAsModules(filePath);

    expect(modules).toHaveLength(2);

    const addressModule = modules.find((module) => module.interfaceName === "AddressDTO");
    const profileModule = modules.find((module) => module.interfaceName === "ProfileDTO");

    expect(addressModule?.fileName).toBe("address-dto.gen.ts");
    expect(profileModule?.fileName).toBe("profile-dto.gen.ts");
    expect(addressModule?.content).toContain("export const AddressDTOSchema = v.object({");
    expect(profileModule?.content).toContain("export const ProfileDTOSchema = v.object({");
    expect(profileModule?.content).toContain(
      'import { AddressDTOSchema } from "./address-dto.gen";',
    );
    expect(profileModule?.content).toContain("address: AddressDTOSchema");
  });

  it("applies custom generated file suffix to module names and local imports", async () => {
    const filePath = await createSourceFile(
      "multi-dto-custom-suffix.ts",
      `
      export interface AddressDTO {
        street: string;
      }

      export interface ProfileDTO {
        address: AddressDTO;
      }
      `,
    );

    const compiler = new SAVCompiler();
    const modules = compiler.processFileAsModules(filePath, ".schema");

    const addressModule = modules.find((module) => module.interfaceName === "AddressDTO");
    const profileModule = modules.find((module) => module.interfaceName === "ProfileDTO");

    expect(addressModule?.fileName).toBe("address-dto.schema.ts");
    expect(profileModule?.fileName).toBe("profile-dto.schema.ts");
    expect(profileModule?.content).toContain(
      'import { AddressDTOSchema } from "./address-dto.schema";',
    );
  });

  it("throws when DTO includes unsupported TypeScript types", async () => {
    const filePath = await createSourceFile(
      "invalid-type.ts",
      `
      export interface InvalidTypeDTO {
        task: Promise<string>;
      }
      `,
    );

    const compiler = new SAVCompiler();

    expect(() => compiler.processFile(filePath)).toThrow(
      /Unsupported TypeScript type "Promise<string>"/,
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
