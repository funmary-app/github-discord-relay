import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
	worker: {
		name: 'github-discord-relay',
		compatibilityDate: '2026-10-01',
		entrypoint: 'src/index.ts',
		workersDev: true,
		observability: {
			enabled: true,
		},
		env: {
			GITHUB_WEBHOOK_SECRET: bindings.secret(),
			DISCORD_WEBHOOK_URL: bindings.secret(),
		},
	},
});
