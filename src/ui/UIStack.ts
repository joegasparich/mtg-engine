import * as PIXI from "pixi.js";

import type { GameEvent_StackAbilityChanged } from "@engine/events/GameEvent_StackAbilityChanged";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { Spell,type StackAbility } from "@engine/GameObject";
import type { Stack } from "@engine/Stack";
import UICard,{ CARD_HEIGHT,CARD_WIDTH } from "@ui/UICard";
import { pixi,type default as UIRoot } from "@ui/UIRoot";
import { UIZone } from "@ui/UIZone";

const CARD_OFFSET_X = 28;
const CARD_OFFSET_Y = 24;
const STACK_SCALE = 1.4;

class UIStackAbility extends PIXI.Container {
    constructor(ability: StackAbility) {
        super();
        const frame = new PIXI.Graphics()
            .roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 8)
            .fill(0x142b32)
            .stroke({ color: 0x83bfb6, width: 1.5 })
            .moveTo(-CARD_WIDTH / 2 + 9, -CARD_HEIGHT / 2 + 30)
            .lineTo(CARD_WIDTH / 2 - 9, -CARD_HEIGHT / 2 + 30)
            .stroke({ color: 0x54726d, width: 1 });
        const source = new PIXI.Text({
            text: ability.source.name,
            style: { fontFamily: "system-ui", fontSize: 11, fontWeight: "600", fill: 0xe6eee9 },
        });
        source.position.set(-CARD_WIDTH / 2 + 9, -CARD_HEIGHT / 2 + 7);
        if (source.width > CARD_WIDTH - 18)
            source.scale.set((CARD_WIDTH - 18) / source.width);

        const type = new PIXI.Text({
            text: "Ability",
            style: { fontFamily: "system-ui", fontSize: 17, fill: 0x83e6de },
        });
        type.anchor.set(0.5);
        this.addChild(frame, source, type);
        this.hitArea = new PIXI.Rectangle(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT);
        this.eventMode = "static";
        this.interactiveChildren = false;
    }
}

export class UIStack extends UIZone<PIXI.Container> {
    private readonly shadow = new PIXI.Graphics();
    private readonly abilities = new Map<StackAbility, UIStackAbility>();
    private readonly status = document.createElement("p");

    constructor(private readonly stack: Stack, private readonly root: UIRoot) {
        super(stack);
        this.sortableChildren = true;
        this.visible = false;
        this.shadow.zIndex = -1;
        this.shadow.eventMode = "none";
        this.shadow.position.set(6, 27);
        this.shadow.alpha = 0.58;
        this.shadow.filters = [new PIXI.BlurFilter({ strength: 8, quality: 3 })];
        this.addChild(this.shadow);

        this.status.className = "visually-hidden";
        this.status.setAttribute("role", "status");
        document.body.append(this.status);
        gameEventManager.onPerformed(GameEventType.StackAbilityChanged, (event: GameEvent_StackAbilityChanged) => {
            if (event.onStack) {
                const view = new UIStackAbility(event.ability);
                this.abilities.set(event.ability, view);
                this.addChild(view);
            } else {
                this.abilities.get(event.ability)?.destroy({ children: true });
                this.abilities.delete(event.ability);
            }
            this.update();
        });
        this.layout();
    }

    override addCard(card: UICard, origin?: PIXI.PointData) {
        super.addCard(card, origin);
        if (!origin)
            card.position.set(0);
        this.update();
    }

    override removeCard(card: UICard) {
        super.removeCard(card);
        card.zIndex = 0;
        this.update();
    }

    layout() {
        const { width, height } = pixi.screen;
        this.position.set(width / 2, height / 2);
        const scale = Math.max(0.01, Math.min(STACK_SCALE, width / 300, height / 320));
        this.scale.set(scale);
        this.shadow.clear();

        const views = this.stack.objects.map(object => object instanceof Spell
            ? this.root.getCardView(object) : this.abilities.get(object)).filter(view => view?.parent === this);
        this.visible = views.length > 0;
        const gaps = Math.max(1, views.length - 1);
        const dx = Math.min(CARD_OFFSET_X, (width / scale * 0.68 - CARD_WIDTH) / gaps);
        const dy = Math.min(CARD_OFFSET_Y, (height / scale * 0.62 - CARD_HEIGHT) / gaps);
        const middle = (views.length - 1) / 2;

        // 405.2: The most recently added object is on top of the stack.
        views.forEach((view, index) => {
            const x = (index - middle) * dx;
            const y = (index - middle) * dy;
            view.zIndex = index;
            if (view instanceof UICard)
                view.layout(x, y);
            else
                view.position.set(x, y);
            this.shadow.roundRect(x - CARD_WIDTH / 2, y - CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 11)
                .fill(0x020e13);
        });
    }

    private update() {
        this.layout();
        const names = this.stack.objects.map(object => object instanceof Spell ? object.name : `${object.source.name}'s ability`);
        this.status.textContent = names.length ? `Stack, top first. ${names.reverse().join(", ")}.` : "";
    }
}
