import { defineConfig } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "github-discord-relay",
		compatibilityDate: "2026-10-01",
		entrypoint: "src/index.ts",
		workersDev: true,
		observability: {
			enabled: true,
		},
	},
});
