import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getBattlefieldPermanentsFromSlate } from "@engine/abilities/ZoneSelection";
import { type ContinuousEffect,ContinuousEffectKind } from "@engine/effects/EffectSystem";
import type { AbilityDef } from "~/defs";
import { AbilityPart_ContinuousEffect } from "./AbilityPart_ContinuousEffect";

@RegisterAbilityPart
export class AbilityPart_GrantAbilityContinuously extends AbilityPart_ContinuousEffect {
    permanentsFrom: string;
    grant: AbilityDef;
    saveAs?: string;

    protected getContinuousEffect(): ContinuousEffect {
        const { slate } = this.ability;
        const { saveAs } = this;
        return {
            kind: ContinuousEffectKind.AbilityGrant,
            grant: this.grant,
            // Refresh on battlefield entry or departure and when types, subtypes, or attachments change.
            recipients: () => getBattlefieldPermanentsFromSlate(this.ability, this.permanentsFrom),
            onGrantsUpdated: saveAs ? grants => {
                if (grants.length)
                    slate[saveAs] = grants;
                else
                    delete slate[saveAs];
            } : undefined,
        };
    }
}
