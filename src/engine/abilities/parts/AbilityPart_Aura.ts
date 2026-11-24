import { resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { Permanent,type Spell } from "@engine/GameObject";
import { GameEvent_ChangeCardZone } from "@engine/events/GameEvent_ChangeCardZone";
import type { GameEvent } from "@engine/events/GameEventManager";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_Aura extends AbilityPart {
    attachmentFrom: string;

    resolvePermanentSpell(spell: Spell): GameEvent_ChangeCardZone {
        const { source } = this.ability;
        const attachment = resolveAbilityGrammar(this.attachmentFrom, this.ability);

        // 608.3b–c: The spell enters attached to its legal target.
        if (attachment instanceof Permanent)
            return new GameEvent_ChangeCardZone(spell, spell.controller.battlefield, { attachedTo: attachment });
        return new GameEvent_ChangeCardZone(source, source.owner.graveyard);
    }

    checkState(actions: GameEvent[]) {
        const { source } = this.ability;
        // 704.5m: An unattached or illegally attached Aura goes to its owner's graveyard.
        if (source instanceof Permanent && !source.hasLegalAttachment())
            actions.push(new GameEvent_ChangeCardZone(source, source.owner.graveyard));
    }
}
