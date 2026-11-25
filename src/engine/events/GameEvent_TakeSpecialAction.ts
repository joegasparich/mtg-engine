import { GameEvent,GameEventType } from "./GameEventManager";

export class GameEvent_TakeSpecialAction extends GameEvent {
    type = GameEventType.TakeSpecialAction;

    constructor(label: string, private readonly takeAction: () => boolean) {
        super();
        this.label = label;
    }

    perform(): boolean {
        return this.takeAction();
    }
}
