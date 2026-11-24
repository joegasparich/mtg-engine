import type { SFCard,SFSet } from './scryfallTypes';

const BASE_URL = 'https://api.scryfall.com';

async function getResource<T>(resource: string, id: string): Promise<T> {
    if (!id.trim()) throw new Error('A Scryfall identifier is required.');
    const response = await fetch(`${BASE_URL}/${resource}/${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
        throw new Error(`Scryfall ${resource} request failed (${response.status}).`);
    }
    return await response.json() as T;
}

export const getSet = (id: string): Promise<SFSet> => getResource('sets', id);
export const getCard = (id: string): Promise<SFCard> => getResource('cards', id);
