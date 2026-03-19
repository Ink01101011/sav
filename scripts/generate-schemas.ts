// scripts/generate-schemas.ts
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const [inputArg = "src/actions/types.ts", outputArg = "src/actions/schemas.gen.ts"] = process.argv.slice(2);
const inputPath = path.resolve(repoRoot, inputArg);
const outputPath = path.resolve(repoRoot, outputArg);

if (!existsSync(inputPath)) {
	console.error(`SAV: Input file not found: ${path.relative(repoRoot, inputPath)}`);
	console.error("Usage: node scripts/generate-schemas.ts <input-file> [output-file]");
	process.exit(1);
}

const compilerModuleUrl = new URL("../src/compiler/index.ts", import.meta.url);
const { SAVCompiler } = await import(compilerModuleUrl.href);
const compiler = new SAVCompiler();
const schemaCode = compiler.processFile(inputPath);

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, schemaCode);
console.log(`SAV: Schemas generated successfully at ${path.relative(repoRoot, outputPath)}.`);
