import { RegisterAbilityPart } from "@engine/abilities/registry";
import { change,Layer } from "@engine/effects/Layers";
import { Permanent } from "@engine/GameObject";
import { ManaUtility } from "@engine/mana";
import { CardType } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_AnimateArtifact extends AbilityPart {
    layerEffect() {
        const source = this.ability.source;
        return {
            select: () => {
                const target = source instanceof Permanent && source.attachedTo;
                return target && target.hasType(CardType.Artifact) && !target.hasType(CardType.Creature) ? [target] : [];
            },
            changes: [
                change(Layer.Type, () => [] as const, state => { state.types = [...state.types, CardType.Creature]; }),
                change(Layer.SetPT, object => [ManaUtility.getManaValue(object.cost)] as const,
                    (state, manaValue) => { state.power = state.toughness = manaValue; }),
            ],
        };
    }
}
