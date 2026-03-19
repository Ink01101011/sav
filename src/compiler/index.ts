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
    const validator = this.getBaseValidator(prop.getType().getText(), prop.getName(), rules);

    if (prop.hasQuestionToken() || optional) {
      return `v.optional(${validator})`;
    }

    return validator;
  }

  private getBaseValidator(
    tsType: string,
    propName: string,
    rules: string[],
  ): string {
    const literalUnionValidator = this.getStringLiteralUnionValidator(tsType, rules, propName);

    if (literalUnionValidator) {
      return literalUnionValidator;
    }

    const pipe = rules.length > 0 ? `[${rules.join(", ")}]` : undefined;

    switch (tsType) {
      case "string":
        return pipe ? `v.string(${pipe})` : "v.string()";

      case "number": {
        const schema = pipe ? `v.number(${pipe})` : "v.number()";
        return `v.coerce(${schema}, (input) => input === "" ? Number.NaN : Number(input))`;
      }

      case "boolean": {
        const schema = pipe ? `v.boolean(${pipe})` : "v.boolean()";
        return `v.coerce(${schema}, (input) => input === "on" || input === "true" || input === true)`;
      }

      case "Date": {
        const schema = pipe ? `v.date(${pipe})` : "v.date()";
        return `v.coerce(${schema}, (input) => input instanceof Date ? input : new Date(String(input)))`;
      }

      case "File": {
        if (rules.length > 0) {
          throw new Error(
            `SAV: File validators are not yet supported for property "${propName}".`,
          );
        }

        return "v.special<File>((input) => input instanceof File)";
      }

      default:
        throw new Error(
          `SAV: Unsupported TypeScript type "${tsType}" on property "${propName}".`,
        );
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

    if (members.length < 2 || !members.every((member) => /^(['"]).*\1$/.test(member))) {
      return undefined;
    }

    if (rules.length > 0) {
      throw new Error(
        `SAV: Additional validators are not supported on literal unions for property "${propName}".`,
      );
    }

    const values = members.map((member) => JSON.stringify(member.slice(1, -1))).join(", ");
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
