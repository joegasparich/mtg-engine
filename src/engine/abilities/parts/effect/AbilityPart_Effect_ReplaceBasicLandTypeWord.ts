import { resolveAbilityGrammar } from "@engine/abilities";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { replaceRulesWord } from "@engine/effects/TextChanges";
import gameEventManager from "@engine/events/GameEventManager";
import { CardObject } from "@engine/GameObject";
import { isBasicLandType,WordKind } from "~/rulesWords";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

@RegisterAbilityPart
export class AbilityPart_Effect_ReplaceBasicLandTypeWord extends AbilityPart_Effect {
    target: string;
    from: string;
    to: string;

    perform() {
        const { ability } = this;
        const target = resolveAbilityGrammar(this.target, ability);
        const from = ability.slate[this.from]?.[0];
        const to = ability.slate[this.to]?.[0];
        if (!(target instanceof CardObject) || !isBasicLandType(from) || !isBasicLandType(to) || from === to)
            return;
        // CR 611.2a, 400.7a: No duration. The resolved effect follows a permanent spell into play.
        gameEventManager.effects.startContinuous(ability, {
            kind: ContinuousEffectKind.Layered,
            effect: { select: () => [target], changes: [replaceRulesWord({ kind: WordKind.BasicLandType, from, to })] },
        });
    }
}
