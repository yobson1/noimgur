import { defineConfig } from 'wxt';

export default defineConfig({
	webExt: {
		startUrls: [
			'https://imgur.com/',
			'https://steamcommunity.com/sharedfiles/filedetails/?id=2424633574'
		]
	},
	zip: {
		excludeSources: ['gen-icons.sh']
	},
	manifest: {
		name: 'noimgur',
		description: 'Redirects imgur.com to rimgo proxy instances for users in blocked regions',
		version: process.env.npm_package_version,
		permissions: [
			'declarativeNetRequest',
			'declarativeNetRequestWithHostAccess',
			'storage',
			'alarms'
		],
		host_permissions: ['*://*.imgur.com/*', 'https://rimgo.codeberg.page/*', '<all_urls>'],
		browser_specific_settings: {
			gecko: {
				id: 'noimgur-amo@yobson.xyz',
				// @ts-ignore - WXT doesn't support this field yet
				data_collection_permissions: {
					required: ['none']
				}
			}
		}
	}
});
