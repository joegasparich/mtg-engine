import {Ability} from "@engine/abilities";
import {Zone} from "@engine/Zone";

export abstract class AbilityPart {
    ability: Ability;

    setup(ability: Ability) {
        this.ability = ability;
    }

    cleanup(ability: Ability) {
    }

    onSignalFired(signal: string) {
    }
}