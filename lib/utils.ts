import type { RimgoInstance } from './types';

export function isPrivate(instance: RimgoInstance): boolean {
	return instance.note?.includes('Data not collected') ?? false;
}

export function collectsData(instance: RimgoInstance): boolean {
	return instance.note?.includes('Data collected') ?? false;
}

export function countryFlag(code: string): string {
	if (!code) return '';
	const offset = 0x1f1e6 - 0x41; // regional indicator A minus latin A
	return code
		.split(',')
		.map((c) => c.trim())
		.filter((c) => c.length === 2)
		.map((c) =>
			[...c.toUpperCase()]
				.map((ch) => String.fromCodePoint(ch.codePointAt(0)! + offset))
				.join('')
		)
		.join(' ');
}
