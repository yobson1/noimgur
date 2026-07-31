export const IMGUR_REGEX = /https?:\/\/(?:i\.)?imgur\.com\//;
export const IMGUR_REGEX_CAPTURE = 'https?://(?:i\\.)?imgur\\.com/(.*)';
export const API_URLS = [
	'https://rimgo.codeberg.page/api.json',
	'https://codeberg.org/rimgo/instances/raw/branch/main/config.json'
] as const;
export const RULE_ID = 1;
export const ROTATE_INTERVAL_MINUTES = 60;
export const ALARM_NAME = 'rotateInstance';

export const STATE_KEYS = ['proxyBase', 'instanceDomain', 'lastUpdated'] as const;
export const PREFS_KEYS = ['blacklist', 'privacyOnly', 'healthySet', 'autoRotate'] as const;
