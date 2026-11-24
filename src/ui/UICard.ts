import * as PIXI from "pixi.js";

import playerActionManager,{ TargetType } from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { PlayerAction_PlayCard } from "@engine/actions/PlayerAction_PlayCard";
import { Hand } from "@engine/Zone";
import { showCustomContextMenu } from "@ui/contextMenu";
import uiEventManager,{ UIEvent_CardClicked } from "@ui/UIEventManager";
import { pixi,uiRoot,UITargeter } from "@ui/UIRoot";
import { loadImageFromExternalUrl } from "@utility/imageUtility";
import { autobind } from "@utility/typeUtility";
import { GlowFilter } from "pixi-filters";

export const CARD_WIDTH = 125;
export const CARD_HEIGHT = 175;
const DRAG_THRESHOLD = 6;

export default class UICard extends PIXI.Container {
    public readonly card: Card;
    public readonly art = new PIXI.Sprite();
    public battlefieldDrop?: PIXI.Point;

    private readonly artwork = new PIXI.Container();
    private readonly halo = new PIXI.Sprite();
    private glowFilter?: GlowFilter;

    private resting = { x: 0, y: 0, angle: 0 };
    private hovered = false;
    private motion = 0.65;
    private isSelected = false;
    private press?: { pointerId: number; origin: PIXI.Point; dragging: boolean };

    public layout(x: number, y: number, angle = 0) {
        this.resting = { x, y, angle };
    }

    private updateHighlight(colour: number | null) {
        this.halo.visible = colour !== null && this.art.texture !== PIXI.Texture.EMPTY;
        if (!this.halo.visible)
            return;

        if (!this.glowFilter) {
            this.glowFilter = new GlowFilter({
                color: colour,
                distance: 20,
                outerStrength: 2,
                quality: 0.5,
                knockout: true,
            });
            this.glowFilter.resolution = 'inherit';
            this.glowFilter.antialias = 'inherit';
            this.halo.filters = [this.glowFilter];
        } else if (this.glowFilter.color !== colour) {
            this.glowFilter.color = colour;
        }
    }

    constructor(card: Card) {
        super();

        this.card = card;

        uiRoot.registerCard(this);

        this.art.anchor.set(0.5);
        this.art.width = CARD_WIDTH;
        this.art.height = CARD_HEIGHT;
        this.halo.anchor.set(0.5);
        this.halo.visible = false;
        // Filter only the glow. The card face renders directly at canvas resolution.
        this.artwork.addChild(this.halo, this.art);
        this.addChild(this.artwork);
        loadImageFromExternalUrl(card.def.image_url).then(texture => {
            if (texture && !this.destroyed) {
                this.art.texture = texture;
                this.halo.texture = texture;
            }
        });

        // The artwork can move independently of the card's interactive footprint.
        this.hitArea = new PIXI.Rectangle(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT);
        this.eventMode = 'static';
        this.interactiveChildren = false;
        this.cursor = 'pointer';
        this.on('pointerover', () => this.setHovered(true));
        this.on('pointerout', () => this.setHovered(false));
        this.on('pointerdown', this.onMouseDown);
        this.on('pointerup', this.onMouseUp);
        this.on('pointerupoutside', this.onMouseUpOutside);
        this.onRender = this.render;
    }

    private setHovered(hovered: boolean) {
        this.hovered = hovered;
        if (this.press?.dragging)
            return;

        if (hovered)
            uiRoot.cardOverlay.attach(this.artwork);
        else if (this.artwork.parentRenderLayer)
            uiRoot.cardOverlay.detach(this.artwork);
    }

    @autobind
    private render() {
        const ease = 0.18;
        const dragging = this.press?.dragging;
        const restingAngle = this.card.tapped ? 90 : this.resting.angle;
        if (!dragging) {
            this.x += (this.resting.x - this.x) * ease;
            this.y += (this.resting.y - this.y) * ease;
        }
        this.angle += ((dragging ? 0 : restingAngle) - this.angle) * ease;

        const preview = this.hovered && !dragging;
        const lifted = preview && this.card.zone instanceof Hand;
        // Rotate the lift back into zone coordinates so the card moves straight up.
        const lift = lifted ? -95 : 0;
        this.artwork.x += (lift * Math.sin(this.rotation) - this.artwork.x) * ease;
        this.artwork.y += (lift * Math.cos(this.rotation) - this.artwork.y) * ease;
        this.artwork.angle += ((lifted ? -this.angle : 0) - this.artwork.angle) * ease;

        this.motion += (1 - this.motion) * ease;
        const size = (preview ? 1.5 : 1) * this.motion;
        this.art.width += (CARD_WIDTH * size - this.art.width) * ease;
        this.art.height += (CARD_HEIGHT * size - this.art.height) * ease;

        const hasAction = playerActionManager.cardActionsForUI.get(this.card)?.length > 0;
        this.updateHighlight(this.isSelected ? 0x00FFFF : hasAction ? 0xFFFFFF : null);
        if (this.halo.visible) {
            this.halo.width = this.art.width;
            this.halo.height = this.art.height;
        }
    }

    public setSelected(selected: boolean) {
        this.isSelected = selected;
    }

    @autobind
    private onDrag(event: PIXI.FederatedPointerEvent) {
        if (!this.press || event.pointerId !== this.press.pointerId)
            return;

        if (!this.press.dragging) {
            const dx = event.global.x - this.press.origin.x;
            const dy = event.global.y - this.press.origin.y;
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD)
                return;

            this.press.dragging = true;
            this.hovered = false;
            this.alpha = 0.85;
            this.cursor = 'grabbing';
            uiRoot.cardOverlay.attach(this.artwork);
        }

        this.parent.toLocal(event.global, null, this.position);
    }

    @autobind
    private onMouseDown(event: PIXI.FederatedPointerEvent) {
        if (event.button !== 0 || this.press)
            return;

        this.press = { pointerId: event.pointerId, origin: event.global.clone(), dragging: false };
        pixi.stage.on('globalpointermove', this.onDrag);
        pixi.canvas.addEventListener('pointercancel', this.onPointerCancel);
        window.addEventListener('blur', this.cancelPress);
    }

    @autobind
    private onPointerCancel(event: PointerEvent) {
        if (event.pointerId === this.press?.pointerId)
            this.cancelPress();
    }

    @autobind
    private cancelPress() {
        if (!this.press)
            return;

        this.press = undefined;
        pixi.stage.off('globalpointermove', this.onDrag);
        pixi.canvas.removeEventListener('pointercancel', this.onPointerCancel);
        window.removeEventListener('blur', this.cancelPress);
        this.alpha = 1;
        this.cursor = 'pointer';
        this.setHovered(false);
    }

    public leaveZone() {
        this.cancelPress();
        this.setHovered(false);
        this.artwork.position.set(0);
        this.artwork.angle = 0;
    }

    private finishPress(event: PIXI.FederatedPointerEvent, releasedOnCard: boolean) {
        if (event.button !== 0 || !this.press || event.pointerId !== this.press.pointerId)
            return;

        const dragging = this.press.dragging;
        this.cancelPress();
        if (!dragging) {
            if (releasedOnCard) {
                this.setHovered(event.pointerType !== 'touch');
                uiEventManager.fire(new UIEvent_CardClicked(this.card));
            }
            return;
        }

        const drop = event.global.clone();
        const controller = this.card.controller;
        const battlefield = uiRoot.playerToUIPlayer.get(controller)?.battlefield;
        if (!battlefield?.containsDrop(drop))
            return;

        if (this.card.zone instanceof Hand) {
            const action = playerActionManager.getCardActions(this.card, controller)
                .find(action => action instanceof PlayerAction_PlayCard);
            if (!action)
                return;

            this.parent.toLocal(drop, null, this.position);
            this.battlefieldDrop = drop;
            action.perform(controller);
            if (this.card.zone instanceof Hand)
                this.battlefieldDrop = undefined;
        } else if (this.parent === battlefield) {
            battlefield.placeCard(this, drop);
            battlefield.setChildIndex(this, battlefield.children.length - 1);
        }
    }

    @autobind
    private onMouseUpOutside(event: PIXI.FederatedPointerEvent) {
        this.finishPress(event, false);
    }

    @autobind
    private onMouseUp(event: PIXI.FederatedPointerEvent) {
        this.finishPress(event, true);
        if (event.button == 2) {
            // const player = game.activePlayer(); // TODO: Uncomment this once priority is in
            const player = this.card.controller;

            const actions = playerActionManager.getCardActions(this.card, player);

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
                            1,
                            targets => action.targets.includes(targets[0]),
                            targets => {
                                action.perform(game.activePlayer(), [targets[0]]);
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
}
