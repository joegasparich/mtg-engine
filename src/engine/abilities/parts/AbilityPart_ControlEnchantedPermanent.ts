import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { AbilityPart } from "./AbilityPart";

@RegisterAbilityPart
export class AbilityPart_ControlEnchantedPermanent extends AbilityPart {
    private recipient?: Permanent;
    private stopListening?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        const { source } = ability;
        if (!(source instanceof Permanent && source.zone instanceof Battlefield))
            return;

        const update = () => {
            // 613.7e: Reattaching gives the Aura a new timestamp. Changing its controller does not.
            if (this.recipient !== source.attachedTo)
                this.recipient?.setControlEffect(ability, undefined);
            this.recipient = source.attachedTo;
            this.recipient?.setControlEffect(ability, source.controller);
        };
        this.stopListening = source.onControlOrAttachmentChanged(update);
        update();
    }

    cleanup() {
        this.stopListening?.();
        this.stopListening = undefined;
        this.recipient?.setControlEffect(this.ability, undefined);
        this.recipient = undefined;
    }
}
