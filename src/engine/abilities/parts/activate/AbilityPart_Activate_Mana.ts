import playerActionManager from "@engine/actions/PlayerActionManager";
import { ManaCost,ManaUtility } from "@engine/mana";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Activate } from "./AbilityPart_Activate";

@RegisterAbilityPart
export class AbilityPart_Activate_Mana extends AbilityPart_Activate {
    cost: string;

    private get payingPlayer() {
        return this.ability.controller ?? this.ability.source.controller;
    }

    canActivate(): boolean {
        const player = this.payingPlayer;
        return !!player && playerActionManager.canAutoPayManaCost(ManaUtility.parseManaString<ManaCost>(this.cost), player);
    }

    payCost(): boolean {
        const player = this.payingPlayer;
        // 602.2b and 116.2c: Pay the cost before carrying out the action.
        return !!player && playerActionManager.payManaCost(ManaUtility.parseManaString<ManaCost>(this.cost), player);
    }
}
