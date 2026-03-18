export const IMGUR_REGEX = /https?:\/\/(?:i\.)?imgur\.com\//;
export const IMGUR_REGEX_CAPTURE = 'https?://(?:i\\.)?imgur\\.com/(.*)';
export const API_URL = 'https://rimgo.codeberg.page/api.json';
export const RULE_ID = 1;
export const ROTATE_INTERVAL_MINUTES = 60;
export const MAX_STATE_AGE_MS = ROTATE_INTERVAL_MINUTES * 60 * 1000;
export const ALARM_NAME = 'rotateInstance';

export const STATE_KEYS = ['proxyBase', 'instanceDomain', 'lastUpdated'] as const;
export const PREFS_KEYS = ['blacklist', 'privacyOnly', 'healthySet', 'autoRotate'] as const;
