import { PlayerAction_ActivateAbility } from "./PlayerAction_ActivateAbility";
import { PlayerAction_DeclareAttacker } from "./PlayerAction_DeclareAttacker";
import { PlayerAction_DeclareBlocker } from "./PlayerAction_DeclareBlocker";
import { PlayerAction_PlayCard } from "./PlayerAction_PlayCard";

export { PlayerAction } from "./PlayerAction";
export { PlayerAction_ActivateAbility } from "./PlayerAction_ActivateAbility";
export { PlayerAction_DeclareAttacker } from "./PlayerAction_DeclareAttacker";
export { PlayerAction_DeclareBlocker } from "./PlayerAction_DeclareBlocker";
export { PlayerAction_PlayCard } from "./PlayerAction_PlayCard";
export * from "./PlayerActionManager";

export const PlayerActions = {
    PlayCard: PlayerAction_PlayCard,
    ActivateAbility: PlayerAction_ActivateAbility,
    DeclareAttacker: PlayerAction_DeclareAttacker,
    DeclareBlocker: PlayerAction_DeclareBlocker
};
