import {
    AbilityEffectDef,
} from "../../defs";
import Card from "../Card";
import Player from "../Player";
import gameEventManager, {GameEvent_Simple, GameEventType} from "../events/GameEventManager";
import {ManaUtility} from "../mana";

interface AbilityEffect {
    label:  (data: AbilityEffectDef, card: Card) => string;
    perform: (data: AbilityEffectDef, card: Card, activator: Player) => void;
}

export interface AbilityEffectDef_AddMana extends AbilityEffectDef {
    mana: string
}

export const AbilityEffects = {
    instanceMap: new Map<string, AbilityEffect>(),
    get(type: string): AbilityEffect {
        if (!this.instanceMap.has(type)) {
            this.instanceMap.set(type, new this[type]());
        }

        return this.instanceMap.get(type);
    },

    AbilityEffect_AddMana: class implements AbilityEffect {
        label(data: AbilityEffectDef, card: Card): string {
            return "Add Mana";
        }

        perform(data: AbilityEffectDef, card: Card, activator: Player): void {
            const casted_data = data as AbilityEffectDef_AddMana;

            ManaUtility.AddMana(activator.manaPool, ManaUtility.parseManaString(casted_data.mana));

            // TODO: Make it log what kind of mana
            gameEventManager.addEvent(new GameEvent_Simple(GameEventType.Log, "Mana Added"));
        }
    }
};
