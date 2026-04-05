import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

function esRawPlugin() {
	return {
		name: 'es-raw',
		enforce: 'pre' as const,
		load(id: string) {
			if (!id.endsWith('.es')) return null;
			const source = readFileSync(id, 'utf-8');
			return `export default ${JSON.stringify(source)};`;
		}
	};
}

export default defineConfig({
	plugins: [esRawPlugin(), sveltekit()],
	optimizeDeps: {
		esbuildOptions: {
			loader: {
				'.es': 'text'
			}
		}
	}
});
