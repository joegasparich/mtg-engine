import { type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_ChangeCardZone } from "@engine/events";
import { CardObject } from "@engine/GameObject";
import { Battlefield,ZoneKind } from "@engine/Zone";
import { AttachmentSubtype,CardType } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChangeZones extends AbilityPart_Effect {
    target: GrammarKey;
    destination: Exclude<ZoneKind, ZoneKind.Stack>;

    perform(effect: OneShotEffect) {
        const { ability } = this;
        const card = resolveAbilityGrammar(this.target, ability);
        if (!(card instanceof CardObject) || !card.zone)
            return;

        if (this.destination !== ZoneKind.Battlefield) {
            // 400.3: Cards go to their owner's library, hand, or graveyard.
            const zone = card.owner[this.destination];
            if (zone && zone !== card.zone)
                effect.emit(new GameEvent_ChangeCardZone(card, zone));
            return;
        }

        // 400.1, 304.4 and 307.4: The battlefield is shared, and instants and sorceries can't enter it.
        if (card.zone instanceof Battlefield || card.type === CardType.Instant || card.type === CardType.Sorcery)
            return;

        // 303.4f: An Aura needs a legal attachment as it enters the battlefield.
        if (card.subtypes.includes(AttachmentSubtype.Aura))
            return;

        // 110.2a: A permanent enters under the control of the player putting it onto the battlefield.
        const controller = ability.controller ?? ability.source.controller;
        if (controller)
            effect.emit(new GameEvent_ChangeCardZone(card, controller.battlefield, { controller }));
    }
}
