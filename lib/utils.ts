import type { RimgoInstance } from './types';

export function isPrivate(instance: RimgoInstance): boolean {
	return instance.note?.includes('Data not collected') ?? false;
}

export function collectsData(instance: RimgoInstance): boolean {
	return instance.note?.includes('Data collected') ?? false;
}
