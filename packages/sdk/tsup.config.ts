import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["index.ts", "contracts.ts", "constants.ts", "proto.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  clean: true,
});