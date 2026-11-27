import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import { abilityGrant } from "@engine/effects/AbilityGrant";
import type { Characteristics } from "@engine/effects/Layers";
import type { CardObject } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import type { AbilityDef } from "~/defs";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_GrantAbilityContinuously extends AbilityPart {
    permanentsFrom: string;
    grant: AbilityDef;
    saveAs?: string;
    private activeRecipients = new Set<CardObject>();
    private grants: ReturnType<typeof abilityGrant>;

    layerEffect() {
        this.grants = abilityGrant(this.grant, this.ability.source, () => this.ability.timestamp, () => this.ability.wordReplacements);
        return { selectionKey: this.permanentsFrom,
            select: () => getObjectsFromSlateInZones(this.ability, this.permanentsFrom, Battlefield),
            changes: [this.grants.change] };
    }

    reconcileLayers(states: ReadonlyMap<CardObject, Characteristics>) {
        const active = new Set<CardObject>();
        for (const [object, state] of states) {
            const ability = this.grants.instances.get(object);
            if (ability && state.abilities.includes(ability)) active.add(object);
        }
        for (const previous of this.activeRecipients)
            if (!active.has(previous)) this.grants.instances.delete(previous);
        this.activeRecipients = active;
        if (this.saveAs) {
            if (active.size && states.get(this.ability.source)?.abilities.includes(this.ability)) this.ability.slate[this.saveAs] = [...active].map(object => this.grants.instances.get(object));
            else delete this.ability.slate[this.saveAs];
        }
    }

    cleanup() {
        if (this.saveAs) delete this.ability.slate[this.saveAs];
    }
}
