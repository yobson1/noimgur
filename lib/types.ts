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
