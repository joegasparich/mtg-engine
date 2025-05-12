import * as PIXI from "pixi.js";

import {Battlefield} from "../engine/Zone";
import {showCustomContextMenu} from "./contextMenu";
import Card from "../engine/Card";
import gameEventManager, {GameEventType} from "../engine/events/GameEventManager";
import {autobind} from "../utility/typeUtility";
import {GameEvent_TapCard, GameEvent_UntapCard} from "../engine/events";
import {pixi, uiRoot} from "./UIRoot";
import {game} from "../engine/Game";

import {GlowFilter} from "pixi-filters";
import uiEventManager, {UIEvent_CardClicked, UIEvent_StartTargeting} from "./UIEventManager";
import {loadImageFromExternalUrl} from "../utility/imageUtility";

export const CARD_WIDTH = 125;
export const CARD_HEIGHT = 175;
const MIN_DRAG = 100; // ms

export default class UICard extends PIXI.Sprite {
    public readonly card: Card;

    private _selected = false;
    public get selected() { return this._selected };
    public set selected(val: boolean) {
        if (this._selected == val)
            return;

        this._selected = val;
        if (this._selected) {
            this.filters = [
                new GlowFilter({
                    distance: 20,
                    outerStrength: 2,
                    quality: 0.5
                })
            ]
        } else {
            this.filters = [];
        }
    }

    constructor(card: Card) {
        super();

        this.card = card;

        uiRoot.registerCard(this);

        loadImageFromExternalUrl(card.def.image_url).then(tex => this.texture = tex)
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

        gameEventManager.on(GameEventType.TapCard, this.onCardTapped)
        gameEventManager.on(GameEventType.UntapCard, this.onCardUntapped)

        this.onRender = this.render;
    }

    @autobind
    render(renderer: PIXI.Renderer) {
        // Called every frame
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
        this.selected = selected;
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
                uiEventManager.fire(new UIEvent_CardClicked(this.card))
            }
        }
        if (event.button == 2) {
            const actions = this.card.getActions(game.activePlayer());

            if (actions.length > 0) {
                showCustomContextMenu(event.global, actions.map(a => a.label()), index => {
                    game.activePlayer().performAction(actions[index]);
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