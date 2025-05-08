import * as PIXI from "pixi.js";

import {game, loadImageFromExternalUrl} from "../renderer";
import {PlayerAction, PlayerAction_ActivatedAbility, PlayerAction_PlayCard} from "../PlayerAction";
import {Battlefield, Hand} from "../Zone";
import {activatedAbilitiesCosts} from "../workers";
import {showCustomContextMenu} from "../contextMenu";
import Card from "../Card";
import gameEventManager, {GameEventType} from "../GameEvents/GameEventManager";
import {autobind} from "../typeUtility";
import {GameEvent_TapCard} from "../GameEvents";
import GameEvent_UntapCard from "../GameEvents/GameEvent_UntapCard";
import {pixi} from "./UIRoot";

export const CARD_WIDTH = 125;
export const CARD_HEIGHT = 175;

export default class UICard extends PIXI.Sprite {
    card: Card;

    constructor(card: Card) {
        super();

        this.card = card;

        loadImageFromExternalUrl(card.def.image_url).then(tex => this.texture = tex)
        this.width = CARD_WIDTH;
        this.height = CARD_HEIGHT;
        this.anchor = new PIXI.Point(0.5, 0.5);

        // Events
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointerdown', this.onMouseDown);
        this.on('pointerup', this.onMouseUp);
        pixi.stage.on('pointerup', this.globalMouseUp);
        pixi.stage.on('pointerupoutside', this.globalMouseUp);

        gameEventManager.on(GameEventType.TapCard, this.onCardTapped)
        gameEventManager.on(GameEventType.UntapCard, this.onCardUntapped)
    }

    // TODO: Put this somewhere better
    getActions(actorID: number): PlayerAction[] {
        const actions: PlayerAction[] = [];

        if (actorID != this.card.controllerID)
            return actions;

        const player = game.players[actorID];

        if (this.card.zone instanceof Hand) {
            if (player.manaPool.canPay(this.card.cost) && this.card.canPlay()) {
                actions.push(new PlayerAction_PlayCard(this.card));
            }
        }

        if (this.card.zone instanceof Battlefield) {
            if (this.card.def.activated_abilities) {
                for (const abilityData of this.card.def.activated_abilities) {
                    if (activatedAbilitiesCosts.get(abilityData.cost).payable(this.card, actorID)) {
                        actions.push(new PlayerAction_ActivatedAbility(abilityData, this.card));
                    }
                }
            }
        }

        return actions;
    }

    @autobind
    public onCardTapped(event: GameEvent_TapCard) {
        if (event.card != this.card)
            return;

        this.angle = 90;
    }
    @autobind
    public onCardUntapped(event: GameEvent_UntapCard) {
        if (event.card != this.card)
            return;

        this.angle = 0;
    }

    preDragPos: PIXI.Point;
    @autobind
    onDrag(event: PIXI.FederatedPointerEvent) {
        this.parent.toLocal(event.global, null, this.position);
    }

    @autobind
    onMouseDown(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            this.alpha = 0.5;
            this.preDragPos = this.position.clone();
            pixi.stage.on('pointermove', this.onDrag);
        }
    }

    @autobind
    onMouseUp(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            if (!(this.card.zone instanceof Battlefield))
                this.position = this.preDragPos;
        }
        if (event.button == 2) {
            const actions = this.getActions(game.currentTurnPlayerID);

            if (actions.length > 0) {
                showCustomContextMenu(event.global, actions.map(a => a.label()), index => {
                    game.currentPlayer().performAction(actions[index]);
                }, event);
            }
        }
    }

    @autobind
    globalMouseUp(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            pixi.stage.off('pointermove', this.onDrag);
            this.alpha = 1;
        }
    }
}