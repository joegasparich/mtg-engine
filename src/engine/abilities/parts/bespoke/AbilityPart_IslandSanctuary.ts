import { AbilityPart_Landwalk } from "@engine/abilities/parts/AbilityPart_Landwalk";
import { AbilityPart_ContinuousEffect } from "@engine/abilities/parts/AbilityPart_ContinuousEffect";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DeclareAttacker } from "@engine/events/GameEvent_CardInteractionChecks";
import { GameEvent_DrawCard } from "@engine/events/GameEvent_DrawCard";
import { OptionalDecision } from "@engine/events/GameEvent_ResolutionChoice";
import type { GameEvent_TurnStart } from "@engine/events/GameEvent_Step";
import gameEventManager,{ GameEvent,GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import type Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { type BasicLandType,Keyword } from "~/defs";

@RegisterAbilityPart
export class AbilityPart_IslandSanctuary extends AbilityPart_ContinuousEffect {
    landType: BasicLandType;
    private readonly declinedDraws = new WeakSet<GameEvent_DrawCard>();

    protected getContinuousEffect(): ContinuousEffect {
        return {
            kind: ContinuousEffectKind.EventCheck,
            beforeCommit: true,
            check: check => {
                const controller = this.ability.source.controller;
                if (!check.committing || game.currentStepIndex !== StepIndex.Draw || game.currentTurnPlayer() !== controller)
                    return;

                // 121.6, 614.1b: Offer to replace each draw, including draws from spells and abilities.
                for (const event of check.events) {
                    if (event instanceof GameEvent_DrawCard && event.player === controller && !this.declinedDraws.has(event))
                        check.replace(event, new OfferToSkipDraw(() => this.offerToSkipDraw(event)));
                }
            },
        };
    }

    private offerToSkipDraw(draw: GameEvent_DrawCard) {
        game.requestOptionalChoice({
            player: draw.player,
            sourceName: this.ability.source.name,
            prompt: "Skip this draw to restrict who can attack you until your next turn?",
            acceptLabel: "Skip draw",
            declineLabel: "Draw card",
        }, decision => {
            if (decision === OptionalDecision.Accept) {
                this.restrictAttacks(draw.player);
            } else {
                // Other copies can still apply to this draw. This copy has already been declined.
                this.declinedDraws.add(draw);
                gameEventManager.performImmediate(draw);
            }
        });
    }

    private restrictAttacks(player: Player) {
        // 508.1c, 611.2a: This restriction lasts until the player's next turn even if the source leaves.
        const landType = this.landType;
        const end = gameEventManager.effects.startContinuous(this.ability, {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_DeclareAttacker
                && event.defender === player && !event.attacker.hasKeyword(Keyword.Flying)
                && !AbilityPart_Landwalk.hasLandwalk(event.attacker, landType)),
        });
        gameEventManager.onGamePerformed<GameEvent_TurnStart>(GameEventType.TurnStart, end, {
            once: true,
            matches: event => event.player === player,
        });
    }
}

class OfferToSkipDraw extends GameEvent {
    type = GameEventType.Log;
    label = "Offer to skip a draw";

    constructor(private readonly offer: () => void) {
        super();
    }

    perform(): boolean {
        this.offer();
        // Announce the choice and any actual draw through their own events.
        return false;
    }
}
