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

    const literalUnion = this.getStringLiteralUnionValidator(tsType, rules, propName);
    const validator = literalUnion ?? this.buildBaseValidator(tsType.trim(), rules, propName);

    if (prop.hasQuestionToken() || optional) {
      return `v.optional(${validator})`;
    }

    return validator;
  }

  private buildBaseValidator(cleanType: string, rules: string[], propName: string): string {
    const normalizedType = this.normalizeType(cleanType);

    if (normalizedType === "string") {
      return rules.length > 0 ? `v.string([${rules.join(", ")}])` : `v.string()`;
    }

    if (normalizedType === "number") {
      const inner = rules.length > 0 ? `v.number([${rules.join(", ")}])` : `v.number()`;
      return `v.transform(v.string(), (input) => input === "" ? Number.NaN : Number(input), ${inner})`;
    }

    if (rules.length > 0) {
      throw new Error(
        `SAV: @sav validators are supported only on string or number fields, but found "${normalizedType}" on property "${propName}".`,
      );
    }

    return this.buildTypeValidator(normalizedType, propName);
  }

  private buildTypeValidator(typeText: string, propName: string): string {
    const normalizedType = this.normalizeType(typeText);

    const unionParts = this.splitTopLevel(normalizedType, "|");
    if (unionParts.length > 1) {
      const validators = unionParts.map((part) => this.buildTypeValidator(part, propName));
      return `v.union([${validators.join(", ")}])`;
    }

    const intersectParts = this.splitTopLevel(normalizedType, "&");
    if (intersectParts.length > 1) {
      const validators = intersectParts.map((part) => this.buildTypeValidator(part, propName));
      return `v.intersect([${validators.join(", ")}])`;
    }

    if (normalizedType.endsWith("[]")) {
      const innerType = this.normalizeType(normalizedType.slice(0, -2));
      return `v.array(${this.buildTypeValidator(innerType, propName)})`;
    }

    const arrayArgs = this.parseGenericTypeArgs(normalizedType, "Array");
    if (arrayArgs) {
      if (arrayArgs.length !== 1) {
        throw new Error(
          `SAV: Invalid Array type "${normalizedType}" on property "${propName}".`,
        );
      }
      const [arrayItem] = arrayArgs;
      if (!arrayItem) {
        throw new Error(
          `SAV: Invalid Array type "${normalizedType}" on property "${propName}".`,
        );
      }
      return `v.array(${this.buildTypeValidator(arrayItem, propName)})`;
    }

    const readonlyArrayArgs = this.parseGenericTypeArgs(normalizedType, "ReadonlyArray");
    if (readonlyArrayArgs) {
      if (readonlyArrayArgs.length !== 1) {
        throw new Error(
          `SAV: Invalid ReadonlyArray type "${normalizedType}" on property "${propName}".`,
        );
      }
      const [readonlyArrayItem] = readonlyArrayArgs;
      if (!readonlyArrayItem) {
        throw new Error(
          `SAV: Invalid ReadonlyArray type "${normalizedType}" on property "${propName}".`,
        );
      }
      return `v.array(${this.buildTypeValidator(readonlyArrayItem, propName)})`;
    }

    if (normalizedType.startsWith("[") && normalizedType.endsWith("]")) {
      const inner = normalizedType.slice(1, -1).trim();
      if (!inner) {
        return "v.tuple([])";
      }
      const itemTypes = this.splitTopLevel(inner, ",");
      const itemValidators = itemTypes.map((itemType) =>
        this.buildTypeValidator(itemType, propName),
      );
      return `v.tuple([${itemValidators.join(", ")}])`;
    }

    const recordArgs = this.parseGenericTypeArgs(normalizedType, "Record");
    if (recordArgs) {
      if (recordArgs.length !== 2) {
        throw new Error(
          `SAV: Invalid Record type "${normalizedType}" on property "${propName}".`,
        );
      }
      const [recordKey, recordValue] = recordArgs;
      if (!recordKey || !recordValue) {
        throw new Error(
          `SAV: Invalid Record type "${normalizedType}" on property "${propName}".`,
        );
      }
      const keyValidator = this.buildRecordKeyValidator(recordKey, propName);
      const valueValidator = this.buildTypeValidator(recordValue, propName);
      return `v.record(${keyValidator}, ${valueValidator})`;
    }

    const setArgs = this.parseGenericTypeArgs(normalizedType, "Set");
    if (setArgs) {
      if (setArgs.length !== 1) {
        throw new Error(
          `SAV: Invalid Set type "${normalizedType}" on property "${propName}".`,
        );
      }
      const [setItem] = setArgs;
      if (!setItem) {
        throw new Error(
          `SAV: Invalid Set type "${normalizedType}" on property "${propName}".`,
        );
      }
      return `v.set(${this.buildTypeValidator(setItem, propName)})`;
    }

    const mapArgs = this.parseGenericTypeArgs(normalizedType, "Map");
    if (mapArgs) {
      if (mapArgs.length !== 2) {
        throw new Error(
          `SAV: Invalid Map type "${normalizedType}" on property "${propName}".`,
        );
      }
      const [mapKey, mapValue] = mapArgs;
      if (!mapKey || !mapValue) {
        throw new Error(
          `SAV: Invalid Map type "${normalizedType}" on property "${propName}".`,
        );
      }
      const keyValidator = this.buildTypeValidator(mapKey, propName);
      const valueValidator = this.buildTypeValidator(mapValue, propName);
      return `v.map(${keyValidator}, ${valueValidator})`;
    }

    const promiseArgs = this.parseGenericTypeArgs(normalizedType, "Promise");
    if (promiseArgs) {
      throw new Error(
        `SAV: Unsupported TypeScript type "${normalizedType}" on property "${propName}".`,
      );
    }

    if (/^(['"]).*\1$/.test(normalizedType)) {
      return `v.literal(${JSON.stringify(normalizedType.slice(1, -1))})`;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(normalizedType)) {
      return `v.literal(${normalizedType})`;
    }

    if (normalizedType === "true" || normalizedType === "false") {
      return `v.literal(${normalizedType})`;
    }

    if (
      !NAME_CONVENTION_TYPES_IGNORE_LOWERCASE.has(normalizedType.toLowerCase()) &&
      /^[A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*$/.test(normalizedType)
    ) {
      return `${normalizedType}Schema`;
    }

    switch (normalizedType) {
      case "string":
        return "v.string()";
      case "number":
        return "v.transform(v.string(), (input) => input === \"\" ? Number.NaN : Number(input), v.number())";
      case "boolean":
        return "v.transform(v.unknown(), v => v === \"on\" || v === \"true\" || v === true, v.boolean())";
      case "bigint":
        return "v.bigint()";
      case "symbol":
        return "v.symbol()";
      case "Date":
        return "v.transform(v.string(), v => new Date(v), v.date())";
      case "Blob":
        return "v.blob()";
      case "File":
        // valibot v0.30 has no v.file(); File can be validated via instanceof.
        return "v.instance(File)";
      case "unknown":
        return "v.unknown()";
      case "any":
        return "v.any()";
      case "never":
        return "v.never()";
      case "null":
        return "v.null_()";
      case "undefined":
        return "v.undefined_()";
      case "void":
        return "v.void_()";
      default:
        return "v.any()";
    }
  }

  private buildRecordKeyValidator(typeText: string, propName: string): string {
    const normalizedType = this.normalizeType(typeText);

    if (normalizedType === "string") {
      return "v.string()";
    }

    const unionParts = this.splitTopLevel(normalizedType, "|");
    if (unionParts.length > 1 && unionParts.every((part) => /^(['"]).*\1$/.test(part))) {
      const values = unionParts.map((part) => JSON.stringify(part.slice(1, -1))).join(", ");
      return `v.picklist([${values}])`;
    }

    throw new Error(
      `SAV: Unsupported Record key type "${normalizedType}" on property "${propName}".`,
    );
  }

  private normalizeType(typeText: string): string {
    let value = typeText.trim();

    while (value.startsWith("(") && value.endsWith(")") && this.isWrappedByOuterParentheses(value)) {
      value = value.slice(1, -1).trim();
    }

    return value;
  }

  private isWrappedByOuterParentheses(value: string): boolean {
    let depth = 0;

    for (let index = 0; index < value.length; index++) {
      const char = value[index];

      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0 && index < value.length - 1) {
          return false;
        }
      }
    }

    return depth === 0;
  }

  private parseGenericTypeArgs(typeText: string, genericName: string): string[] | undefined {
    const prefix = `${genericName}<`;

    if (!typeText.startsWith(prefix) || !typeText.endsWith(">")) {
      return undefined;
    }

    const inner = typeText.slice(prefix.length, -1).trim();
    if (!inner) {
      return [];
    }

    return this.splitTopLevel(inner, ",");
  }

  private splitTopLevel(input: string, separator: "|" | "&" | ","): string[] {
    const parts: string[] = [];
    let current = "";
    let depthParen = 0;
    let depthAngle = 0;
    let depthSquare = 0;
    let depthCurly = 0;
    let quote: "'" | '"' | undefined;

    for (let index = 0; index < input.length; index++) {
      const char = input[index];
      const prev = input[index - 1];

      if (quote) {
        current += char;
        if (char === quote && prev !== "\\") {
          quote = undefined;
        }
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        current += char;
        continue;
      }

      if (char === "(") {
        depthParen += 1;
      } else if (char === ")") {
        depthParen = Math.max(0, depthParen - 1);
      } else if (char === "<") {
        depthAngle += 1;
      } else if (char === ">") {
        depthAngle = Math.max(0, depthAngle - 1);
      } else if (char === "[") {
        depthSquare += 1;
      } else if (char === "]") {
        depthSquare = Math.max(0, depthSquare - 1);
      } else if (char === "{") {
        depthCurly += 1;
      } else if (char === "}") {
        depthCurly = Math.max(0, depthCurly - 1);
      }

      if (
        char === separator &&
        depthParen === 0 &&
        depthAngle === 0 &&
        depthSquare === 0 &&
        depthCurly === 0
      ) {
        const trimmed = current.trim();
        if (trimmed) {
          parts.push(trimmed);
        }
        current = "";
        continue;
      }

      current += char;
    }

    const tail = current.trim();
    if (tail) {
      parts.push(tail);
    }

    return parts;
  }

  private getStringLiteralUnionValidator(
    tsType: string,
    rules: string[],
    propName: string,
  ): string | undefined {
    const members = this.splitTopLevel(tsType, "|")
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
