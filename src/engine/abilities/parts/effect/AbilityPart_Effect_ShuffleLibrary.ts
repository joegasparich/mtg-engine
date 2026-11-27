import { RegisterAbilityPart } from "@engine/abilities/registry";
import Player from "@engine/Player";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ShuffleLibrary extends AbilityPart_Effect {
    playersFrom: string;
    outSignal?: string;

    perform() {
        // CR 701.24c–d: Shuffle even if none of the specified cards moved.
        for (const player of new Set(this.ability.slate[this.playersFrom])) {
            if (player instanceof Player)
                player.library.shuffle();
        }
        if (this.outSignal)
            this.ability.fireSignal(this.outSignal);
    }
}
