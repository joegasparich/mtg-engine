import { CombatManager } from "@engine/CombatManager";
import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import type { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";

export class GameEvent_RegeneratePermanent extends GameEvent {
    type = GameEventType.RegeneratePermanent;

    constructor(readonly permanent: Permanent, private readonly consumeShield: () => void) {
        super();
        this.label = `Permanent ${permanent.logName} regenerated`;
    }

    perform(): boolean {
        if (this.permanent.retired || !(this.permanent.zone instanceof Battlefield))
            return false;

        // 701.19a and 506.4: Clear damage, tap, and remove it from combat as the replacement.
        this.permanent.damageTaken = 0;
        this.permanent.tapped = true;
        CombatManager.removeFromCombat(this.permanent);
        this.consumeShield();
        return true;
    }
}
