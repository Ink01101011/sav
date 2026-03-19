import type { InterfaceDeclaration, PropertySignature } from "ts-morph";
import { Project } from "ts-morph";

const VALIBOT_IMPORT = 'import * as v from "valibot";\n\n';

const ALLOWED_RULES = new Set([
  "email",
  "url",
  "uuid",
  "regex",
  "minLength",
  "maxLength",
  "length",
  "min",
  "max",
  "minValue",
  "maxValue",
  "includes",
  "startsWith",
  "endsWith",
  "optional",
]);

const NAME_CONVENTION_TYPES_IGNORE_LOWERCASE = new Set([
  "string",
  "number",
  "boolean",
  "date",
  "file",
  "unknown",
  "any",
  "never",
  "null",
  "undefined",
  "function",
  "object",
  "[]",
  "array",
  "formdata",
  "true",
  "false",
]);

const RULE_ALIASES: Record<string, string> = {
  min: "minValue",
  max: "maxValue",
};

type ConstraintResult = {
  rules: string[];
  optional: boolean;
};

export class SAVCompiler {
  constructor(private readonly project: Project = new Project()) {}

  processFile(filePath: string): string {
    return this.processFiles([filePath]);
  }

  processFiles(filePaths: readonly string[]): string {
    const schemaBlocks = filePaths
      .map((filePath) => this.generateSchemasForFile(filePath))
      .filter(Boolean)
      .join("");

    return `${VALIBOT_IMPORT}${schemaBlocks}`;
  }

  private generateSchemasForFile(filePath: string): string {
    const sourceFile =
      this.project.getSourceFile(filePath) ??
      this.project.addSourceFileAtPathIfExists(filePath);

    if (!sourceFile) {
      throw new Error(`SAV: Source file not found: ${filePath}`);
    }

    return sourceFile
      .getInterfaces()
      .filter((intf) => intf.getName().endsWith("DTO"))
      .map((intf) => this.generateSchema(intf))
      .join("");
  }

  private generateSchema(intf: InterfaceDeclaration): string {
    const entries = intf
      .getProperties()
      .map((prop) => `  ${prop.getName()}: ${this.buildValidator(prop)},`)
      .join("\n");

    return `export const ${intf.getName()}Schema = v.object({\n${entries}\n});\n\n`;
  }

  private buildValidator(prop: PropertySignature): string {
    const { optional, rules } = this.extractConstraints(prop);
    const tsType = prop.getType().getText();
    const propName = prop.getName();

    let validator = "";

    // 1. เช็ค Literal Union ก่อน (ฟีเจอร์ที่คุณเขียนไว้ดีมาก เก็บไว้ใช้งานต่อ)
    const literalUnion = this.getStringLiteralUnionValidator(
      tsType,
      rules,
      propName,
    );

    if (literalUnion) {
      validator = literalUnion;
    } else {
      const basePipes = this.getBasePipes(tsType);

      const allPipes = [...basePipes, ...rules];

      validator =
        allPipes.length > 1
          ? `v.pipe(${allPipes.join(", ")})`
          : (allPipes[0] ?? "v.any()");
    }

    // 5. จัดการเครื่องหมาย ? หรือคำสั่ง @sav optional
    if (prop.hasQuestionToken() || optional) {
      return `v.optional(${validator})`;
    }

    return validator;
  }

  private getBasePipes(tsType: string): string[] {
    const cleanType = tsType.trim();
    // Handle array types

    if (
      cleanType.endsWith("[]") ||
      /^Array<.*>$/.test(cleanType) ||
      /^ReadonlyArray<.*>$/.test(cleanType)
    ) {
      const innerType = cleanType
        .replace(/\[\]$/, "")
        .replace(/^(?:Readonly)?Array<(.*)>$/, "$1")
        .trim();
      return [`v.array(${innerType}Schema)`];
    }

    // Handle tuple types like [string, number] or [string, number, boolean]
    if (
      cleanType.startsWith("[") &&
      cleanType.endsWith("]")
    ) // support simple tuples like [string, number]
    {
      const innerTypes = cleanType
        .slice(1, -1)
        .split(",")
        .map((t) => t.trim());
      const validators = innerTypes.map((t) => {
        const pipes = this.getBasePipes(t);
        return pipes.length > 1
          ? `v.pipe(${pipes.join(", ")})`
          : (pipes[0] ?? "v.any()");
      });
      return [`v.tuple([${validators.join(", ")}])`];
    }

    // Handle custom types (interfaces/DTOs)
    if (
      !NAME_CONVENTION_TYPES_IGNORE_LOWERCASE.has(cleanType.toLowerCase()) &&
      /^[A-Z]/.test(cleanType)
    ) {
      return [`${cleanType}Schema`];
    }

    switch (cleanType) {
      case "string":
        return ["v.string()"];
      case "number":
        return ["v.string()", "v.transform(Number)", "v.number()"];
      case "boolean":
        return [
          "v.unknown()",
          'v.transform(v => v === "on" || v === "true" || v === true)',
          "v.boolean()",
        ];
      case "Date":
        return ["v.string()", "v.transform(v => new Date(v))", "v.date()"];
      case "File":
        return ["v.instance(File)"];
      default:
        return ["v.any()"];
    }
  }

  private getStringLiteralUnionValidator(
    tsType: string,
    rules: string[],
    propName: string,
  ): string | undefined {
    const members = tsType
      .split("|")
      .map((member) => member.trim())
      .filter(Boolean);

    if (
      members.length < 2 ||
      !members.every((member) => /^(['"]).*\1$/.test(member))
    ) {
      return undefined;
    }

    if (rules.length > 0) {
      throw new Error(
        `SAV: Additional validators are not supported on literal unions for property "${propName}".`,
      );
    }

    const values = members
      .map((member) => JSON.stringify(member.slice(1, -1)))
      .join(", ");
    return `v.picklist([${values}])`;
  }

  private extractConstraints(prop: PropertySignature): ConstraintResult {
    const result: ConstraintResult = { rules: [], optional: false };
    const propName = prop.getName();

    for (const doc of prop.getJsDocs()) {
      const text = doc.getInnerText();
      const savIndex = text.indexOf("@sav");

      if (savIndex === -1) {
        continue;
      }

      const rawCommands = text.slice(savIndex + 4).trim();

      if (!rawCommands) {
        continue;
      }

      for (const command of this.splitCommands(rawCommands)) {
        const match = command.match(/^([a-zA-Z]+)(\(.*\))?$/);

        if (!match?.[1]) {
          throw new Error(
            `SAV: Invalid @sav command "${command}" on property "${propName}".`,
          );
        }

        const ruleName = match[1];

        if (!ALLOWED_RULES.has(ruleName)) {
          throw new Error(
            `SAV: Unsupported @sav rule "${ruleName}" on property "${propName}".`,
          );
        }

        if (ruleName === "optional") {
          result.optional = true;
          continue;
        }

        const finalRuleName = RULE_ALIASES[ruleName] ?? ruleName;
        const args = match[2] ?? "()";
        result.rules.push(`v.${finalRuleName}${args}`);
      }
    }

    return result;
  }

  private splitCommands(input: string): string[] {
    const commands: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of input) {
      if (char === "(") {
        depth += 1;
      }

      if (char === ")") {
        depth = Math.max(0, depth - 1);
      }

      if (char === "," && depth === 0) {
        if (current.trim()) {
          commands.push(current.trim());
        }
        current = "";
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      commands.push(current.trim());
    }

    return commands;
  }
}
