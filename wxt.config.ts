import { defineConfig } from 'wxt';

export default defineConfig({
	webExt: {
		startUrls: [
			'https://imgur.com/',
			'https://steamcommunity.com/sharedfiles/filedetails/?id=2424633574'
		]
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
