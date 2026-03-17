import { defineConfig } from 'wxt';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const testsDir = resolve(fileURLToPath(new URL('.', import.meta.url)), 'tests');

async function serveTests(): Promise<string> {
	const server = createServer(async (req, res) => {
		const filePath = resolve(testsDir, (req.url ?? '/').replace(/^\//, '') || 'fixture.html');
		try {
			const data = await readFile(filePath);
			res.writeHead(200);
			res.end(data);
		} catch {
			res.writeHead(404);
			res.end('Not found');
		}
	});

	await new Promise<void>((res) => server.listen(0, res));
	const { port } = server.address() as { port: number };
	return `http://localhost:${port}/fixture.html`;
}

const fixtureUrl = await serveTests();

export default defineConfig({
	webExt: {
		startUrls: ['https://imgur.com/', fixtureUrl]
	},
	manifest: {
		name: 'noimgur',
		description:
			'Redirects imgur.com to a rimgo proxy instance for users in regions where imgur is blocked. Distributes load across all public rimgo instances.',
		version: '1.0.0',
		permissions: [
			'declarativeNetRequest',
			'declarativeNetRequestWithHostAccess',
			'storage',
			'alarms'
		],
		host_permissions: [
			'*://*.imgur.com/*',
			'https://rimgo.codeberg.page/*',
			// Firefox requires the redirect *target* host to also be in host_permissions.
			// Since rimgo instances can be on any domain, we need broad access here.
			'<all_urls>'
		]
	}
});
