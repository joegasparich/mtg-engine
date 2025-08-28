import {AbilityPart_Effect, GrammarKey, resolveAbilityGrammar} from "@engine/abilities";
import {RegisterAbilityPart} from "@engine/abilities/registry";
import Player from "@engine/Player";
import {ManaUtility} from "@engine/mana";

@RegisterAbilityPart
export class AbilityPart_Effect_AddMana extends AbilityPart_Effect {
    target: GrammarKey;
    mana: string;

    perform() {
        const player = resolveAbilityGrammar(this.target, this.ability) as Player;
        const mana = ManaUtility.parseManaString(this.mana);

        // gameEventManager.addEvent(new GameEvent_AddMana(player, mana));
        ManaUtility.addMana(player.manaPool, mana);
    }
}