export interface RimgoInstance {
	domain: string;
	url: string;
	country: string;
	provider: string;
	note?: string;
}

export interface RimgoApiResponse {
	title: string;
	logo: string;
	projectLink: string;
	apiUrl: string;
	baseUrl: string;
	clearnet: RimgoInstance[];
	tor: RimgoInstance[];
	i2p: RimgoInstance[];
}

export interface StoredState {
	proxyBase: string;
	instanceDomain: string;
	lastUpdated: number;
}

export interface StoredPrefs {
	blacklist: string[]; // domains the user has manually unticked
	privacyOnly: boolean; // only pick instances where note includes "Data not collected"
	healthySet: string[]; // domains that passed the last health check
}
