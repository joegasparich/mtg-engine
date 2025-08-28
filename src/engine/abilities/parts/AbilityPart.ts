import {Ability} from "@engine/abilities";

export abstract class AbilityPart {
    ability: Ability;

    setup(ability: Ability) {
        this.ability = ability;
    }

    cleanup() {
    }

    onSignalFired(signal: string) {
    }
}