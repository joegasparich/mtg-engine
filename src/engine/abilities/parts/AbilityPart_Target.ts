import {AbilityPart} from "./AbilityPart";
import {Ability} from "../Ability";
import {ActionTarget, TargetTypeKeys} from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import {autobind} from "@utility/typeUtility";
import {RegisterAbilityPart} from "@engine/abilities/registry";

@RegisterAbilityPart
export class AbilityPart_Target extends AbilityPart {
    inSignal: string;
    outSignal = "default";
    saveAs: string;
    validTargets: TargetTypeKeys[];
    count = 1;

    setup(ability: Ability) {
        super.setup(ability);

        if (!this.inSignal)
            throw new Error("AbilityPart_Target requires inSignal to be set");
    }

    onSignalFired(signal: string) {
        if (signal !== this.inSignal)
            return;

        playerActionManager.startTargeting(this.validTargets, this.count, this.validateTargets, (targets) => {
            this.ability.slate[this.saveAs] = targets;
            this.ability.fireSignal(this.outSignal);
        });
    }

    @autobind
    validateTargets(targets: ActionTarget[]) { return true; }
}