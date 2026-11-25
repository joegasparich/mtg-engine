import * as PIXI from "pixi.js";

import { PlayerAction_DeclareAttacker,PlayerAction_DeclareBlocker } from "@engine/actions";
import playerActionManager,{ TargetType } from "@engine/actions/PlayerActionManager";
import { CardObject,Permanent } from "@engine/GameObject";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { PlayerAction_PlayCard } from "@engine/actions/PlayerAction_PlayCard";
import { Battlefield,Hand } from "@engine/Zone";
import { showCustomContextMenu } from "@ui/contextMenu";
import type { BattlefieldCardGroup } from "@ui/UIBattlefield";
import { UICardPowerToughness } from "@ui/UICardPowerToughness";
import { pixi,uiRoot,UITargeter } from "@ui/UIRoot";
import { loadImageFromExternalUrl } from "@utility/imageUtility";
import { autobind } from "@utility/typeUtility";
import { GlowFilter } from "pixi-filters";
import { CardType } from "~/defs";

export const CARD_WIDTH = 125;
export const CARD_HEIGHT = 175;
const ATTACK_ANGLE = 10;
const DRAG_THRESHOLD = 6;

export default class UICard extends PIXI.Container {
    get card() { return this.object.card; }
    public readonly art = new PIXI.Sprite();
    public battlefieldDrop?: PIXI.Point;
    public battlefieldGroup?: BattlefieldCardGroup;

    private readonly artwork = new PIXI.Container();
    private readonly halo = new PIXI.Sprite();
    private powerToughness?: UICardPowerToughness;
    private focusOutline?: PIXI.Graphics;
    private glowFilter?: GlowFilter;

    private resting = { x: 0, y: 0, angle: 0 };
    private hovered = false;
    private motion = 0.65;
    private combatRole: 'attack' | 'block' | null = null;
    private combatTarget: UICard | undefined;
    private combatColour?: number | null;
    private combatStartedAt = 0;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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

    constructor(public object: CardObject) {
        super();

        uiRoot.registerCard(this);

        this.art.anchor.set(0.5);
        this.art.width = CARD_WIDTH;
        this.art.height = CARD_HEIGHT;
        this.halo.anchor.set(0.5);
        this.halo.visible = false;
        // Filter only the glow. The card face renders directly at canvas resolution.
        this.artwork.addChild(this.halo, this.art);
        this.addChild(this.artwork);
        loadImageFromExternalUrl(this.card.def.image_url).then(texture => {
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
        if (hovered && this.battlefieldGroup?.dragging)
            return;

        this.hovered = hovered;
        if (this.press?.dragging)
            return;

        if (hovered && this.object.zone !== game.stack)
            uiRoot.cardOverlay.attach(this.artwork);
        else if (this.artwork.parentRenderLayer)
            uiRoot.cardOverlay.detach(this.artwork);
    }

    public clearPreview() {
        this.hovered = false;
        if (this.artwork.parentRenderLayer)
            uiRoot.cardOverlay.detach(this.artwork);
    }

    private updatePowerToughness() {
        const { object, art } = this;
        if (!(object instanceof Permanent) || !(object.zone instanceof Battlefield)
            || object.type !== CardType.Creature || object.def.type !== CardType.Creature
            || art.texture === PIXI.Texture.EMPTY) {
            if (this.powerToughness)
                this.powerToughness.visible = false;
            return;
        }

        const power = object.power;
        // 120.6 and 302.7: Marked damage is tracked separately from the creature's actual toughness.
        const remainingToughness = object.toughness - object.damageTaken;
        const damaged = object.damageTaken > 0;
        const show = damaged || power !== object.def.power || remainingToughness !== object.def.toughness;
        if (this.powerToughness)
            this.powerToughness.visible = show;
        if (!show)
            return;

        this.powerToughness ??= this.artwork.addChildAt(
            new UICardPowerToughness(art.texture, CARD_WIDTH, CARD_HEIGHT),
            2,
        );
        this.powerToughness.setStats(power, remainingToughness, object.def, damaged);
        this.powerToughness.scale.set(art.width / CARD_WIDTH, art.height / CARD_HEIGHT);
    }

    @autobind
    private render() {
        const ease = 0.18;
        const group = this.battlefieldGroup;
        const dragging = group?.dragging ?? this.press?.dragging;
        const attackAngle = this.combatRole === 'attack' ? ATTACK_ANGLE : 0;
        const restingAngle = this.object instanceof Permanent && this.object.tapped ? 90 : this.resting.angle + attackAngle;
        if (!dragging) {
            const position = group?.permanent === this ? group.position : this.position;
            const advance = this.combatAdvance();
            position.x += (this.resting.x + advance.x - position.x) * ease;
            position.y += (this.resting.y + advance.y - position.y) * ease;
        }
        this.angle += ((dragging && !group ? 0 : restingAngle) - this.angle) * ease;

        const preview = this.hovered && !dragging && this.object.zone !== game.stack;
        const lifted = preview && this.object.zone instanceof Hand;

        this.motion += (1 - this.motion) * ease;
        const size = (preview ? 1.5 : 1) * this.motion;
        this.art.width += (CARD_WIDTH * size - this.art.width) * ease;
        this.art.height += (CARD_HEIGHT * size - this.art.height) * ease;

        const sin = Math.sin(this.rotation);
        const cos = Math.cos(this.rotation);
        if (group?.permanent === this && group.children.length > 1) {
            // Keep the expanded face clear of the Aura title strips, even on a tapped or tilted host.
            const extraWidth = Math.max(0, this.art.width - CARD_WIDTH);
            const extraHeight = Math.max(0, this.art.height - CARD_HEIGHT);
            const offset = (extraWidth * Math.abs(sin) + extraHeight * Math.abs(cos)) / 2;
            this.artwork.position.set(offset * sin, offset * cos);
        } else {
            // Rotate the lift back into zone coordinates so a hand preview moves straight up.
            const lift = lifted ? -95 : 0;
            this.artwork.x += (lift * sin - this.artwork.x) * ease;
            this.artwork.y += (lift * cos - this.artwork.y) * ease;
        }
        this.artwork.angle += ((lifted ? -this.angle : 0) - this.artwork.angle) * ease;
        this.updatePowerToughness();

        const selection = uiRoot.cardSelection;
        const state = selection?.stateFor(this.object);
        const hasAction = playerActionManager.cardActionsForUI.get(this.object)?.length > 0;
        const normalHighlight = this.combatColour === undefined ? (hasAction ? 0xffffff : null) : this.combatColour;
        let highlight = normalHighlight;
        if (selection) {
            highlight = null;
            if (state === 'eligible')
                highlight = 0xe3c58a;
            else if (state === 'selected' && !uiRoot.combat.isSelectingAttackers)
                highlight = 0x64f2df;
        }
        this.updateHighlight(highlight);
        if (this.halo.visible) {
            this.halo.width = this.art.width;
            this.halo.height = this.art.height;
        }

        const focused = selection?.focusedCard === this.object && document.activeElement === pixi.canvas;
        if (focused && !this.focusOutline) {
            this.focusOutline = new PIXI.Graphics().roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 8)
                .stroke({ color: 0xffffff, width: 2 });
            this.artwork.addChild(this.focusOutline);
        }
        if (this.focusOutline) {
            this.focusOutline.visible = focused;
            this.focusOutline.width = this.art.width + 8;
            this.focusOutline.height = this.art.height + 8;
        }
    }

    public setCombatDisplay(role: 'attack' | 'block' | null, colour?: number | null, target?: UICard) {
        if (this.combatRole !== role || this.combatTarget !== target)
            this.combatStartedAt = performance.now();
        this.combatRole = role;
        this.combatTarget = target;
        this.combatColour = colour;
    }

    private combatAdvance(): PIXI.PointData {
        if (!this.combatRole)
            return { x: 0, y: 0 };

        // Push forward, then settle into a distinct combat position until combat ends.
        const progress = Math.min(1, (performance.now() - this.combatStartedAt) / 380);
        const pulse = this.reducedMotion.matches ? 0 : Math.sin(Math.PI * progress) * 30;
        const distance = 36 + pulse;
        if (!this.combatTarget?.parent)
            return { x: 0, y: -distance };

        const movementZone = this.battlefieldGroup?.battlefield ?? this.parent;
        const target = movementZone.toLocal(this.combatTarget.getGlobalPosition());
        const dx = target.x - this.resting.x;
        const dy = target.y - this.resting.y;
        const length = Math.hypot(dx, dy);
        const scale = Math.min(0.24, distance / Math.max(1, length));
        return { x: dx * scale, y: dy * scale };
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

            if (game.pendingResolutionChoice || game.pendingCombatDamageChoice) {
                this.cancelPress();
                return;
            }

            if (this.battlefieldGroup && !this.battlefieldGroup.beginDrag(this, this.press.origin)) {
                this.cancelPress();
                return;
            }
            this.press.dragging = true;
            this.cursor = 'grabbing';
            if (!this.battlefieldGroup) {
                this.hovered = false;
                this.alpha = 0.85;
                uiRoot.cardOverlay.attach(this.artwork);
            }
        }

        if (this.battlefieldGroup)
            this.battlefieldGroup.moveDrag(event.global);
        else
            this.parent.toLocal(event.global, null, this.position);
    }

    @autobind
    private onMouseDown(event: PIXI.FederatedPointerEvent) {
        if (event.button !== 0 || this.press)
            return;

        this.press = { pointerId: event.pointerId, origin: event.global.clone(), dragging: false };
        if (this.object.zone instanceof Hand || this.battlefieldGroup)
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
        this.battlefieldGroup?.cancelDrag(this);
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
        if (dragging && this.battlefieldGroup) {
            this.battlefieldGroup.finishDrag(event.global);
            this.cancelPress();
            return;
        }

        this.cancelPress();
        if (!dragging) {
            if (releasedOnCard) {
                this.setHovered(event.pointerType !== 'touch');
                uiRoot.handleCardClick(this.object);
            }
            return;
        }

        const drop = event.global.clone();
        const controller = this.object.owner;
        const battlefield = uiRoot.playerToUIPlayer.get(controller)?.battlefield;
        if (!battlefield?.containsDrop(drop))
            return;

        if (this.object.zone instanceof Hand) {
            const action = playerActionManager.getCardActions(this.object, controller)
                .find(action => action instanceof PlayerAction_PlayCard);
            if (!action)
                return;

            this.parent.toLocal(drop, null, this.position);
            this.battlefieldDrop = drop;
            action.perform(controller);
            if (this.object.zone instanceof Hand)
                this.battlefieldDrop = undefined;
        }
    }

    @autobind
    private onMouseUpOutside(event: PIXI.FederatedPointerEvent) {
        this.finishPress(event, false);
    }

    @autobind
    private onMouseUp(event: PIXI.FederatedPointerEvent) {
        this.finishPress(event, true);
        if (event.button !== 2)
            return;

        const player = game.activePlayer();
        const actions = playerActionManager.getCardActions(this.object, player)
            .filter(action => !(action instanceof PlayerAction_DeclareAttacker || action instanceof PlayerAction_DeclareBlocker));
        if (actions.length === 0)
            return;

        const turn = game.turnNumber;
        const step = game.currentStepIndex;
        const source = this.object;
        const isCurrentStep = () => this.object === source && game.turnNumber === turn && game.currentStepIndex === step && game.activePlayer() === player;

        showCustomContextMenu(event.global, actions.map(action => action.label()), index => {
            if (!isCurrentStep())
                return;

            const action = actions[index];
            if (!action.targets?.length) {
                action.perform(player);
                return;
            }

            let targetType = TargetType.None;
            if (action.targets.some(target => target instanceof CardObject))
                targetType |= TargetType.Card;
            if (action.targets.some(target => target instanceof Player))
                targetType |= TargetType.Player;

            const targeter = new UITargeter(
                this,
                targetType,
                1,
                targets => isCurrentStep() && action.targets.includes(targets[0]),
                targets => {
                    targeter.remove();
                    action.perform(player, targets);
                },
                null
            );
        }, event);
    }
}
