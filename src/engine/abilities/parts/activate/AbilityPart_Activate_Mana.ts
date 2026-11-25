import playerActionManager from "@engine/actions/PlayerActionManager";
import { ManaCost,ManaUtility } from "@engine/mana";
import { RegisterAbilityPart } from "../../registry";
import { AbilityPart_Activate } from "./AbilityPart_Activate";

@RegisterAbilityPart
export class AbilityPart_Activate_Mana extends AbilityPart_Activate {
    cost: string;

    canActivate(): boolean {
        const { controller } = this.ability.source;
        return !!controller && playerActionManager.canAutoPayManaCost(ManaUtility.parseManaString<ManaCost>(this.cost), controller);
    }

    payCost(): boolean {
        const { controller } = this.ability.source;
        // 602.2b: Pay the activation cost before the ability is added to the stack.
        return !!controller && playerActionManager.payManaCost(ManaUtility.parseManaString<ManaCost>(this.cost), controller);
    }
}
