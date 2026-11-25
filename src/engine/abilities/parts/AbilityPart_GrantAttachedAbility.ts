import { RegisterAbilityPart } from "@engine/abilities/registry";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import type { AbilityDef } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_GrantAttachedAbility extends AbilityPart_ContinuousEffect {
    grant: AbilityDef;
    saveAs?: string;

    onAttachmentChanged() {
        this.refreshEffect();
    }

    protected getContinuousEffect(): ContinuousEffect | undefined {
        // 611.3a: Apply the grant to the current attachment.
        const { source, slate } = this.ability;
        if (!(source instanceof Permanent) || !(source.attachedTo?.zone instanceof Battlefield))
            return;

        const { saveAs } = this;
        return {
            kind: ContinuousEffectKind.AbilityGrant, recipient: source.attachedTo, grant: this.grant,
            onGrantChanged: saveAs ? granted => {
                if (granted)
                    slate[saveAs] = granted;
                else
                    delete slate[saveAs];
            } : undefined,
        };
    }
}
