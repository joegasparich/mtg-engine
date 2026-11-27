import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckRequiredAttack } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager from "@engine/events/GameEventManager";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_RequireAttacksThisTurn extends AbilityPart_Effect {
    player: GrammarKey;

    perform() {
        const player = resolveAbilityGrammar(this.player, this.ability);
        // 611.2c: This changes the rules of combat, so check control when attackers are declared.
        gameEventManager.startContinuousUntilEndOfTurn(this.ability, {
            kind: ContinuousEffectKind.EventCheck,
            check: ({ events }) => {
                for (const event of events) {
                    if (event instanceof GameEvent_CheckRequiredAttack && event.attacker.controller === player)
                        event.required = true;
                }
            },
        });
    }
}
