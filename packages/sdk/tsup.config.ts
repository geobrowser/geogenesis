import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["index.ts", "contracts.ts", "constants.ts", "proto.ts", "abis.ts", "ids.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  clean: true,
});