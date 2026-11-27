import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_DeclareBlocker } from "@engine/events/GameEvent_CardInteractionChecks";
import { game } from "@engine/Game";
import type { CardObject } from "@engine/GameObject";
import { type BasicLandType,CardType } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_Landwalk extends AbilityPart_ContinuousEffect {
    landType: BasicLandType;

    static hasLandwalk(object: CardObject, type: BasicLandType): boolean {
        return object.abilities.some(ability => ability.parts.some(part =>
            part instanceof AbilityPart_Landwalk && part.landType === type));
    }

    protected getContinuousEffect(): ContinuousEffect {
        // 509.1a, 702.14c: The proposed blocker's controller is defending against this attacker.
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: check => check.removeWhere(event => event instanceof GameEvent_DeclareBlocker
                && event.attacker === this.ability.source
                && game.players.some(player => player.battlefield.objects.some(land =>
                    land.controller === event.blocker.controller && land.hasType(CardType.Land)
                    && land.subtypes.includes(this.landType)))),
        };
    }
}
