import { Container,type PointData } from "pixi.js";

import { Permanent } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import UICard from "@ui/UICard";
import { pixi,uiRoot } from "@ui/UIRoot";
import { UIZone } from "@ui/UIZone";

const AURA_TITLE_OFFSET = 28;

export class BattlefieldCardGroup extends Container<UICard> {
    private drag?: { view: UICard; offset: PointData };

    constructor(public battlefield: UIBattlefield, readonly permanent: UICard) {
        super();
        this.addCard(permanent);
    }

    get dragging() { return Boolean(this.drag); }

    addCard(view: UICard) {
        view.battlefieldGroup = this;
        this.addChildAt(view, 0);
        this.layoutAuras();
    }

    removeCard(view: UICard) {
        view.leaveZone();
        view.battlefieldGroup = undefined;
        this.removeChild(view);
        // Keep remaining Auras in place for their exit animations if the permanent left first.
        if (this.permanent.parent === this)
            this.layoutAuras();
    }

    private layoutAuras() {
        for (let i = this.children.length - 1, offset = 0; i >= 0; i--) {
            const view = this.children[i];
            if (view === this.permanent) {
                view.position.set(0);
                continue;
            }

            offset += AURA_TITLE_OFFSET;
            view.layout(0, -offset);
            view.position.set(0, -offset);
        }
    }

    beginDrag(view: UICard, origin: PointData) {
        if (this.drag)
            return false;

        const start = this.battlefield.toLocal(origin);
        this.drag = { view, offset: { x: this.x - start.x, y: this.y - start.y } };
        for (const member of this.children)
            member.clearPreview();
        this.battlefield.setChildIndex(this, this.battlefield.children.length - 1);
        this.alpha = 0.85;
        uiRoot.cardOverlay.attach(this);
        return true;
    }

    moveDrag(point: PointData) {
        const local = this.battlefield.toLocal(point);
        this.position.set(local.x + this.drag.offset.x, local.y + this.drag.offset.y);
    }

    finishDrag(point: PointData) {
        if (this.battlefield.containsDrop(point)) {
            this.moveDrag(point);
            this.permanent.layout(this.x, this.y);
        }
    }

    cancelDrag(view: UICard) {
        if (this.drag?.view !== view)
            return;

        this.drag = undefined;
        this.alpha = 1;
        uiRoot.cardOverlay.detach(this);
    }
}

export class UIBattlefield extends UIZone<BattlefieldCardGroup> {
    constructor(battlefield: Battlefield) {
        super(battlefield);
    }

    containsDrop(point: PointData) {
        const local = this.toLocal(point);
        return pixi.screen.contains(point.x, point.y)
            && local.y <= -150
            && local.y >= -pixi.screen.height / 2;
    }

    addCard(uiCard: UICard, origin?: PointData) {
        const drop = uiCard.battlefieldDrop;
        uiCard.battlefieldDrop = undefined;
        const attachedGroup = uiCard.object instanceof Permanent
            ? uiRoot.getCardView(uiCard.object.attachedTo)?.battlefieldGroup : undefined;
        if (attachedGroup) {
            attachedGroup.addCard(uiCard);
            return;
        }

        const group = new BattlefieldCardGroup(this, uiCard);
        this.addChild(group);
        const start = drop ?? origin;
        if (start)
            this.toLocal(start, null, group.position);
        else
            group.position.set(pixi.screen.width * 0.35, -200);

        if (drop) {
            uiCard.layout(group.x, group.y);
            return;
        }

        this.layoutGroup(group);
    }

    takeGroup(group: BattlefieldCardGroup) {
        for (const card of group.children)
            card.leaveZone();
        this.addChild(group);
        group.battlefield = this;
        this.layoutGroup(group);
    }

    private layoutGroup(group: BattlefieldCardGroup) {
        const index = this.getChildIndex(group);
        group.permanent.layout((index % 6 - 2.5) * 145, -pixi.screen.height / 3 - Math.floor(index / 6) * 190);
    }

    removeCard(uiCard: UICard) {
        const group = uiCard.battlefieldGroup;
        group.removeCard(uiCard);
        if (!group.children.length)
            group.destroy();
    }
}
