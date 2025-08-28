import * as PIXI from "pixi.js";

import Card from "@engine/Card";
import {GlowFilter} from "pixi-filters";
import {pixi, TargetType, uiRoot, UITargeter} from "@ui/UIRoot";
import {loadImageFromExternalUrl} from "@utility/imageUtility";
import gameEventManager, {GameEventType} from "@engine/events/GameEventManager";
import {autobind} from "@utility/typeUtility";
import playerActionManager from "@engine/actions/PlayerActionManager";
import {GameEvent_TapCard, GameEvent_UntapCard} from "@engine/events";
import {Battlefield} from "@engine/Zone";
import uiEventManager, {UIEvent_CardClicked} from "@ui/UIEventManager";
import {showCustomContextMenu} from "@ui/contextMenu";
import Player from "@engine/Player";
import {game} from "@engine/Game";

export const CARD_WIDTH = 125;
export const CARD_HEIGHT = 175;
const MIN_DRAG = 100; // ms

export default class UICard extends PIXI.Sprite {
    public readonly card: Card;

    private hasAction: boolean;
    private isSelected: boolean;

    private _highlightColour?: number = null;
    private get highlighted() { return this._highlightColour != null; }
    private set highlightColour(val: number | null) {
        if (this._highlightColour == val)
            return;

        this._highlightColour = val;
        if (this._highlightColour) {
            this.filters = [
                new GlowFilter({
                    color: this._highlightColour,
                    distance: 20,
                    outerStrength: 2,
                    quality: 0.5
                })
            ];
        } else {
            this.filters = [];
        }
    }

    constructor(card: Card) {
        super();

        this.card = card;

        uiRoot.registerCard(this);

        loadImageFromExternalUrl(card.def.image_url).then(tex => this.texture = tex);
        this.width = CARD_WIDTH;
        this.height = CARD_HEIGHT;
        this.anchor = new PIXI.Point(0.5, 0.5);

        // Events, TODO: Clean these up if card is destroyed
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointerdown', this.onMouseDown);
        this.on('pointerup', this.onMouseUp);
        pixi.stage.on('pointerup', this.globalMouseUp);
        pixi.stage.on('pointerupoutside', this.globalMouseUp);

        gameEventManager.onPerformed(GameEventType.TapCard, this.onCardTapped);
        gameEventManager.onPerformed(GameEventType.UntapCard, this.onCardUntapped);

        this.onRender = this.render;
    }

    @autobind
    render(renderer: PIXI.Renderer) {
        // Called every frame
        this.hasAction = playerActionManager.cardActionsForUI.get(this.card)?.length > 0;

        if (this.isSelected)
            this.highlightColour = 0x00FFFF;
        else if (this.hasAction)
            this.highlightColour = 0xFFFFFF;
        else
            this.highlightColour = null;
    }

    @autobind
    private onCardTapped(event: GameEvent_TapCard) {
        if (event.card != this.card)
            return;

        this.angle = 90;
    }
    @autobind
    private onCardUntapped(event: GameEvent_UntapCard) {
        if (event.card != this.card)
            return;

        this.angle = 0;
    }

    public setSelected(selected: boolean) {
        this.isSelected = selected;
    }

    private preDragPos: PIXI.Point;
    private dragStartTime: number;
    private hasDragged: boolean;
    @autobind
    onDrag(event: PIXI.FederatedPointerEvent) {
        if (Date.now() - this.dragStartTime < MIN_DRAG)
            return;

        this.alpha = 0.5;
        this.hasDragged = true;
        this.parent.toLocal(event.global, null, this.position);
    }

    @autobind
    private onMouseDown(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            this.preDragPos = this.position.clone();
            this.dragStartTime = Date.now();
            pixi.stage.on('pointermove', this.onDrag);
        }
    }

    @autobind
    private onMouseUp(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            if (!(this.card.zone instanceof Battlefield))
                this.position = this.preDragPos;

            if (!this.hasDragged) {
                uiEventManager.fire(new UIEvent_CardClicked(this.card));
            }
        }
        if (event.button == 2) {
            // const player = game.activePlayer(); // TODO: Uncomment this once priority is in
            const player = this.card.controller;

            const actions = playerActionManager.getCardActions(this.card, player, false);

            if (actions.length > 0) {
                showCustomContextMenu(event.global, actions.map(a => a.label()), index => {
                    const action = actions[index];


                    if (action.targets && action.targets.length > 0) {
                        let targetType = TargetType.None;

                        if (action.targets.some(t => t instanceof Card))
                            targetType |= TargetType.Card;
                        if (action.targets.some(t => t instanceof Player))
                            targetType |= TargetType.Player;

                        // TODO: Multitargeting
                        const targeter = new UITargeter(
                            this,
                            targetType,
                            target => action.targets.includes(target),
                            target => {
                                action.perform(game.activePlayer(), [target]);
                                targeter.remove();
                            },
                            null
                        );
                    } else {
                        action.perform(game.activePlayer());
                    }
                }, event);
            }
        }
    }

    @autobind
    private globalMouseUp(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            pixi.stage.off('pointermove', this.onDrag);
            this.alpha = 1;
            this.hasDragged = false;
        }
    }
}