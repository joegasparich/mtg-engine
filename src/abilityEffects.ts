import {
    AbilityEffectData,
    AbilityEffectType,
} from "./CardDef";
import {game} from "./renderer";
import Card from "./Card";
import {ManaColour} from "./Player";
import gameEventManager, {GameEvent_Simple, GameEventType} from "./GameEvents/GameEventManager";

export interface AbilityEffectWorker {
    type: AbilityEffectType;

    label:  (data: AbilityEffectData, card: Card) => string;
    perform: (data: AbilityEffectData, card: Card, activatorID: number) => void;
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

    perform(data: AbilityEffectData, card: Card, activatorID: number): void {
        const casted_data = data as AbilityEffectData_AddMana;

        game.players[activatorID].manaPool.pool[ManaColour.W] += casted_data.W ?? 0;
        game.players[activatorID].manaPool.pool[ManaColour.U] += casted_data.U ?? 0;
        game.players[activatorID].manaPool.pool[ManaColour.B] += casted_data.B ?? 0;
        game.players[activatorID].manaPool.pool[ManaColour.R] += casted_data.R ?? 0;
        game.players[activatorID].manaPool.pool[ManaColour.G] += casted_data.G ?? 0;
        game.players[activatorID].manaPool.pool[ManaColour.C] += casted_data.C ?? 0;

        // TODO: Make it log what kind of mana
        gameEventManager.addEvent(new GameEvent_Simple(GameEventType.Log, "Mana Added"));
    }
}