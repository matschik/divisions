import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/lib/index.ts", "src/bin/div.ts"],
	sourcemap: true,
	clean: true,
	format: ["esm"],
	dts: true,
});
