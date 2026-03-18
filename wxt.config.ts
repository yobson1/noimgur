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
		version: '1.1.0',
		permissions: [
			'declarativeNetRequest',
			'declarativeNetRequestWithHostAccess',
			'storage',
			'alarms'
		],
		host_permissions: ['*://*.imgur.com/*', 'https://rimgo.codeberg.page/*', '<all_urls>'],
		browser_specific_settings: {
			gecko: {
				id: 'noimgur@yobson.xyz',
				// @ts-ignore - WXT doesn't support this field yet
				data_collection_permissions: {
					required: ['none']
				}
			}
		}
	}
});
