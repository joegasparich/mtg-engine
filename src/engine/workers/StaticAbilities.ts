import Card from "../Card";

export interface StaticAbility {
    init: (card: Card) => void;
    deinit: (card: Card) => void;
}

export const StaticAbilities = {
    instanceMap: new Map<string, StaticAbility>(),
    get(type: string): StaticAbility {
        if (!this.instanceMap.has(type)) {
            this.instanceMap.set(type, new this[type]);
        }

        return this.instanceMap.get(type);
    },

    StaticAbility_Flying: class implements StaticAbility {
        init(card: Card) {
        }
        deinit(card: Card) {}
    }
};
