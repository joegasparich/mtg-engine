import {RegisterAbilityPart} from "@engine/abilities/registry";
import {autobind} from "@utility/typeUtility";
import {Keyword} from "~/defs";
import {Battlefield} from "@engine/Zone";
import {ActionListenerResult, PlayerAction_DeclareBlocker} from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import {removeItem} from "@utility/arrayUtility";
import { AbilityPart } from "./AbilityPart";
import { Ability } from "../Ability";

@RegisterAbilityPart
class AbilityPart_Flying extends AbilityPart {
    setup(ability: Ability) {
        super.setup(ability);

        if (!(ability.card.zone instanceof Battlefield))
            return;

        playerActionManager.on(PlayerAction_DeclareBlocker.name, this.onDeclareBlocker);
    }

    cleanup(ability: Ability) {
        if (!(ability.card.zone instanceof Battlefield))
            return;

        playerActionManager.off(PlayerAction_DeclareBlocker.name, this.onDeclareBlocker);
    }

    @autobind
    onDeclareBlocker(action: PlayerAction_DeclareBlocker): ActionListenerResult {
        if (action.targets.includes(this.ability.card) && !this.canBlockFlying(action.card))
            removeItem(action.targets, this.ability.card);

        if (action.targets.length == 0)
            return ActionListenerResult.Remove;
    }

    canBlockFlying(blocker: Card) {
        if (blocker.hasKeyword(Keyword.Flying))
            return true;

        if (blocker.hasKeyword(Keyword.Reach))
            return true;

        return false;
    }
}