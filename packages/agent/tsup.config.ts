import { defineConfig } from "tsup"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/cli/cli.ts",
    "src/cli/ink/index.ts",  // Ink REPL 入口
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  splitting: false,
  // 支持 JSX/TSX
  esbuildOptions(options) {
    options.jsx = "automatic"
  },
})
