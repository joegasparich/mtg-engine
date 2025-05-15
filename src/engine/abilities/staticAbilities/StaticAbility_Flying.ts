import Card from "../../Card";
import {autobind} from "../../../utility/typeUtility";
import {ActionListenerResult, PlayerAction_DeclareBlocker} from "../../actions";
import {removeItem} from "../../../utility/arrayUtility";
import {Keyword} from "../../../defs";
import playerActionManager from "../../actions/PlayerActionManager";
import {StaticAbility} from "./StaticAbility";

export class StaticAbility_Flying extends StaticAbility {
    constructor(card: Card) {
        super(card);

        playerActionManager.on(PlayerAction_DeclareBlocker.name, this.onDeclareBlocker);
    }

    cleanup(card: Card) {
        playerActionManager.off(PlayerAction_DeclareBlocker.name, this.onDeclareBlocker);
    }

    @autobind
    onDeclareBlocker(action: PlayerAction_DeclareBlocker): ActionListenerResult {
        if (action.targets.includes(this.card) && !this.canBlockFlying(action.card))
            removeItem(action.targets, this.card);

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