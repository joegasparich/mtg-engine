import type { GrammarKey } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { GameEvent_ChangeCardZone } from "@engine/events";
import { game } from "@engine/Game";
import { CardObject } from "@engine/GameObject";
import { Battlefield,Zone,ZoneKind } from "@engine/Zone";
import { AttachmentSubtype,CardType } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ChangeZones extends AbilityPart_Effect {
    target: GrammarKey;
    destination: Exclude<ZoneKind, ZoneKind.Stack>;
    outSignal?: string;

    perform(effect: OneShotEffect) {
        const cards = new Set(getObjectsFromSlateInZones(this.ability, this.target, Zone));
        const moves = [...cards].map(card => this.moveFor(card)).filter(move => move !== undefined);
        if (moves.length === 1)
            effect.emit(moves[0]);
        else if (moves.length > 1)
            effect.performSimultaneous(moves);
        // 608.2c and 609.3: Continue with the next instruction even if the move was prevented.
        if (this.outSignal)
            effect.continueResolution(() => this.ability.fireSignal(this.outSignal));
    }

    private moveFor(card: unknown): GameEvent_ChangeCardZone | undefined {
        const { ability } = this;
        if (!(card instanceof CardObject))
            return;

        if (this.destination !== ZoneKind.Battlefield) {
            // 400.3: Cards go to their owner's library, hand, or graveyard.
            const zone = this.destination === ZoneKind.Exile ? game.exile : card.owner[this.destination];
            if (zone && zone !== card.zone)
                return new GameEvent_ChangeCardZone(card, zone);
            return;
        }

        // 400.1, 304.4 and 307.4: The battlefield is shared, and instants and sorceries can't enter it.
        if (card.zone instanceof Battlefield || card.hasType(CardType.Instant) || card.hasType(CardType.Sorcery))
            return;

        // 303.4f: An Aura needs a legal attachment as it enters the battlefield.
        if (card.subtypes.includes(AttachmentSubtype.Aura))
            return;

        // 110.2a: A permanent enters under the control of the player putting it onto the battlefield.
        const controller = ability.controller ?? ability.source.controller;
        if (controller)
            return new GameEvent_ChangeCardZone(card, controller.battlefield, { controller });
    }
}
