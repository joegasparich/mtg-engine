import {Ability} from "@engine/abilities";

export abstract class AbilityPart {
    ability: Ability;

    setup(ability: Ability) {
        this.ability = ability;
    }

    cleanup(ability: Ability) {}

    onSignalFired(signal: string) {}
}