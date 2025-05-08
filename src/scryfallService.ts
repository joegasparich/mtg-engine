import {SFCard, SFSet} from "./scryfallTypes";

const BASE_URL = "https://api.scryfall.com";

async function getSet(setID: string): Promise<SFSet> {
    const res = await fetch(`${BASE_URL}/sets/${setID}`)
    return await res.json() as SFSet;
}

async function getCard(cardID: string): Promise<SFCard> {
    const res = await fetch(`${BASE_URL}/cards/${cardID}`);
    return await res.json() as SFCard;
}

export {
    getSet,
    getCard
}