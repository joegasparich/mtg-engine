import {
    AbilityEffectDef,
    AbilityEffectType,
} from "../defs";
import Card from "./Card";
import Player from "./Player";
import gameEventManager, {GameEvent_Simple, GameEventType} from "./events/GameEventManager";
import {ManaAmount, ManaUtility} from "./mana";

export interface AbilityEffectWorker {
    type: AbilityEffectType;

    label:  (data: AbilityEffectDef, card: Card) => string;
    perform: (data: AbilityEffectDef, card: Card, activator: Player) => void;
}
export namespace AbilityEffectWorker {
    type Constructor<T> = {
        new(...args: any[]): T;
        readonly prototype: T;
    }
    const implementations: Constructor<AbilityEffectWorker>[] = [];
    export function GetImplementations(): Constructor<AbilityEffectWorker>[] {
        return implementations;
    }
    export function register<T extends Constructor<AbilityEffectWorker>>(ctor: T) {
        implementations.push(ctor);
        return ctor;
    }
}

export interface AbilityEffectDef_AddMana extends AbilityEffectDef {
    mana: string
}
@AbilityEffectWorker.register
class AbilityEffectWorker_AddMana {
    type = AbilityEffectType.AddMana;

    label(data: AbilityEffectDef, card: Card): string {
        return "Add Mana";
    }

    perform(data: AbilityEffectDef, card: Card, activator: Player): void {
        const casted_data = data as AbilityEffectDef_AddMana;

        ManaUtility.AddMana(activator.manaPool, ManaUtility.parseManaString(casted_data.mana))

        // TODO: Make it log what kind of mana
        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.Log, "Mana Added"));
    }
}