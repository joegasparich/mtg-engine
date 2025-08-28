export enum ManaColour {
    W, U, B, R, G, Colourless, Generic
}
export type ManaAmount = [
    white: number,
    blue: number,
    black: number,
    red: number,
    green: number,
    colorless: number
];
export type ManaCost = [
    white: number,
    blue: number,
    black: number,
    red: number,
    green: number,
    colorless: number,
    generic: number
];
export type Mana = ManaAmount | ManaCost;

export namespace ManaUtility {
    const manaStringCache = new Map<string, Mana>()

    export function addMana(pool: Mana, added: Readonly<Mana>) {
        for (let i = 0; i < 6; i++) {
            pool[i] += added[i];
        }
    }

    export function parseManaString<T extends ManaCost | ManaAmount>(manaString: string): Readonly<T> {
        if (manaStringCache.has(manaString))
            return manaStringCache.get(manaString) as T;

        const mana: Mana = [0, 0, 0, 0, 0, 0, 0];
        const pips = manaString.split("}").slice(0, -1).map(c => c.substring(1));
        for (const pip of pips) {
            switch (pip) {
                case "W": mana[0]++; break;
                case "U": mana[1]++; break;
                case "B": mana[2]++; break;
                case "R": mana[3]++; break;
                case "G": mana[4]++; break;
                case "C": mana[5]++; break;
                default:  mana[6] += parseInt(pip); break;
            }
        }

        manaStringCache.set(manaString, [...mana]);

        return mana as T;
    }


    export function canPay(cost: ManaCost, pool: ManaAmount): boolean {
        return this.pay(cost, [...pool]);
    }

    // This picks the colours for the player prioritising colourless
    export function pay(cost: ManaCost, pool: ManaAmount): boolean {
        if (!cost)
            return true;

        // WUBRG + specifically colourless
        for (let i = 0; i < 6; i++) {
            if (pool[i] < cost[i])
                return false;

            pool[i] -= cost[i];
        }

        // Any, prioritising colourless
        let any = cost[6];
        for (let i = 5; i >= 0; i--) {
            if (pool[i] > 0) {
                const diff = Math.min(any, pool[i]);
                any -= diff;
                pool[i] -= diff;
            }

            if (any <= 0)
                return true;
        }
    }
}