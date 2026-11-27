import { GameEvent,GameEventType } from "@engine/events/GameEventManager";
import type Player from "@engine/Player";
import type { ManaAmount } from "@engine/mana";

export class GameEvent_LoseMana extends GameEvent {
    type = GameEventType.LoseMana;
    mana?: Readonly<ManaAmount>;

    constructor(readonly player: Player) {
        super();
        this.label = `Player ${player.id} lost all unspent mana`;
    }

    perform(): boolean {
        // 106.4: Unspent mana belongs to the player whose pool contains it.
        const { manaPool } = this.player;
        if (!manaPool.some(amount => amount > 0))
            return false;

        this.mana = [...manaPool];
        manaPool.fill(0);
        return true;
    }
}
