import {PlayerAction_PlayCard} from "./PlayerAction_PlayCard";
import {PlayerAction_ActivateAbility} from "./PlayerAction_ActivateAbility";
import {PlayerAction_DeclareAttacker} from "./PlayerAction_DeclareAttacker";
import {PlayerAction_DeclareBlocker} from "./PlayerAction_DeclareBlocker";

export * from "./PlayerAction";
export {PlayerAction_PlayCard} from "./PlayerAction_PlayCard";
export {PlayerAction_ActivateAbility} from "./PlayerAction_ActivateAbility";
export {PlayerAction_DeclareAttacker} from "./PlayerAction_DeclareAttacker";
export {PlayerAction_DeclareBlocker} from "./PlayerAction_DeclareBlocker";

export const PlayerActions = {
    PlayCard: PlayerAction_PlayCard,
    ActivateAbility: PlayerAction_ActivateAbility,
    DeclareAttacker: PlayerAction_DeclareAttacker,
    DeclareBlocker: PlayerAction_DeclareBlocker
};
