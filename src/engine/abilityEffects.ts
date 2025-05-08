import {
    AbilityEffectData,
    AbilityEffectType,
} from "../defs";
import Card from "./Card";
import Player, {ManaColour} from "./Player";
import gameEventManager, {GameEvent_Simple, GameEventType} from "./events/GameEventManager";

export interface AbilityEffectWorker {
    type: AbilityEffectType;

    label:  (data: AbilityEffectData, card: Card) => string;
    perform: (data: AbilityEffectData, card: Card, activator: Player) => void;
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

export interface AbilityEffectData_AddMana extends AbilityEffectData {
    W: number
    U: number
    B: number
    R: number
    G: number
    C: number
}
@AbilityEffectWorker.register
class AbilityEffectWorker_AddMana {
    type = AbilityEffectType.AddMana;

    label(data: AbilityEffectData, card: Card): string {
        return "Add Mana";
    }

    perform(data: AbilityEffectData, card: Card, activator: Player): void {
        const casted_data = data as AbilityEffectData_AddMana;

        activator.manaPool.pool[ManaColour.W] += casted_data.W ?? 0;
        activator.manaPool.pool[ManaColour.U] += casted_data.U ?? 0;
        activator.manaPool.pool[ManaColour.B] += casted_data.B ?? 0;
        activator.manaPool.pool[ManaColour.R] += casted_data.R ?? 0;
        activator.manaPool.pool[ManaColour.G] += casted_data.G ?? 0;
        activator.manaPool.pool[ManaColour.C] += casted_data.C ?? 0;

        // TODO: Make it log what kind of mana
        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.Log, "Mana Added"));
    }
}