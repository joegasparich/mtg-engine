import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { game } from "@engine/Game";
import type { TargetValidator } from "~/defs";
import { AbilityPart_Effect } from "./effect/AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_SelectPermanents extends AbilityPart_Effect {
    saveAs: string;
    targetValidator?: TargetValidator;
    outSignal?: string;

    perform() {
        this.ability.slate[this.saveAs] = game.players.flatMap(player =>
            player.battlefield.objects.filter(permanent => matchesTargetValidator(permanent, this)));
        if (this.outSignal)
            this.ability.fireSignal(this.outSignal);
    }
}
