import { defineConfig } from "tsup";

export default defineConfig([
  // core — runtime validation helpers (browser + server, no Node-specific APIs)
  {
    entry: { "core/index": "src/core/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    target: "es2022",
    treeshake: true,
  },
  // react — hooks that wrap core (React peer dep must stay external)
  {
    entry: { "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    target: "es2022",
    treeshake: true,
    external: ["react"],
    // Bundle core inline so the react subpath is self-contained;
    // if a consumer imports both subpaths the bundler will de-duplicate.
    noExternal: [/\.\.\/core/],
  },
  // compiler — Node-only code-generation tool + CLI
  {
    entry: {
      "compiler/index": "src/compiler/index.ts",
      "compiler/cli": "src/compiler/cli.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    target: "node18",
    platform: "node",
    treeshake: true,
  },
]);
