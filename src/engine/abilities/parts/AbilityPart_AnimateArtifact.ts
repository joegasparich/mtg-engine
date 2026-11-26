import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckCharacteristics } from "@engine/events/GameEvent_CardInteractionChecks";
import { Permanent } from "@engine/GameObject";
import { CardType } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_AnimateArtifact extends AbilityPart_ContinuousEffect {
    protected getContinuousEffect(): ContinuousEffect {
        const { source } = this.ability;
        return {
            kind: ContinuousEffectKind.EventCheck,
            check: ({ events }) => {
                for (const event of events) {
                    if (!(event instanceof GameEvent_CheckCharacteristics) || !(source instanceof Permanent)
                        || source.attachedTo !== event.object)
                        continue;

                    const values = event.characteristics;
                    if (!values.types.includes(CardType.Artifact) || values.types.includes(CardType.Creature))
                        continue;

                    // 613.1d, 613.4b: Animate the noncreature artifact and set P/T before additive modifiers.
                    const manaValue = event.object.cost?.reduce((sum, amount) => sum + amount, 0) ?? 0;
                    values.types = [...values.types, CardType.Creature];
                    values.basePower = manaValue;
                    values.baseToughness = manaValue;
                }
            },
        };
    }
}
