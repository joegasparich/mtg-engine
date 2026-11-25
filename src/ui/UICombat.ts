import * as PIXI from "pixi.js";

import { PlayerAction_DeclareAttacker,PlayerAction_DeclareBlocker } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { CardObject,Permanent } from "@engine/GameObject";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_GoToNextStep } from "@engine/events";
import type { GameEvent_StepEnd } from "@engine/events/GameEvent_Step";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { StepIndex } from "@engine/Step";
import { drawArrow } from "@ui/drawUtility";
import type UICard from "@ui/UICard";
import { UICardSelection } from "@ui/UICardSelection";
import UIRoot,{ pixi } from "@ui/UIRoot";
import { autobind } from "@utility/typeUtility";

const ATTACK_COLOUR = 0xf6b96c;
const BLOCK_COLOUR = 0x83e6de;
const TARGET_COLOUR = 0xffe6a6;
const ELIGIBLE_BLOCK_COLOUR = 0x6ba9ae;

export class UICombat {
    private readonly overlay = new PIXI.Container();
    private readonly links = new PIXI.Container<PIXI.Graphics>();
    private readonly badges = new Map<Permanent, PIXI.Container>();
    private readonly attackNumbers = new Map<Permanent, number>();
    private readonly highlighted = new Set<UICard>();
    private readonly panel = document.createElement('section');
    private readonly heading = document.createElement('h2');
    private readonly status = document.createElement('p');
    private readonly instruction = document.createElement('p');
    private readonly removeBlock = document.createElement('button');
    private readonly confirm = document.createElement('button');
    private selectedBlocker: Permanent | null = null;
    private readonly eligible: Set<Permanent> = new Set();
    private readonly legalTargets: Set<Permanent> = new Set();
    private readonly attackerSelection = new UICardSelection<Permanent>((card, selected) => {
        const action = new PlayerAction_DeclareAttacker(card);
        const actor = game.activePlayer();
        if (selected)
            action.perform(actor);
        else
            action.withdraw(actor);
        this.sync();
    });

    get cardSelection() {
        if (game.currentStepIndex === StepIndex.DeclareAttackers && !game.hasPendingPlayerInput)
            return this.attackerSelection;
    }

    constructor(private readonly root: UIRoot) {
        this.overlay.eventMode = 'none';
        this.overlay.addChild(this.links);
        pixi.stage.addChild(this.overlay);
        pixi.ticker.add(this.positionOverlay);

        this.heading.id = 'combat-heading';
        this.status.setAttribute('role', 'status');
        this.panel.className = 'card-selection-panel combat-panel';
        this.panel.setAttribute('aria-labelledby', this.heading.id);
        this.panel.hidden = true;
        this.removeBlock.textContent = 'Remove block';
        this.removeBlock.addEventListener('click', this.withdrawBlock);
        this.confirm.addEventListener('click', () => gameEventManager.addEvent(new GameEvent_GoToNextStep()));
        this.panel.append(this.heading, this.status, this.instruction, this.removeBlock, this.confirm);
        document.body.append(this.panel);

        gameEventManager.onPerformed(GameEventType.StepStart, () => {
            this.sync();
            if (this.cardSelection)
                this.root.focusCardSelection();
        });
        gameEventManager.onPerformed(GameEventType.StepEnd, this.onStepEnd);
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.sync);
        gameEventManager.onPerformed(GameEventType.TapCard, this.sync);
        gameEventManager.onPerformed(GameEventType.UntapCard, this.sync);
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.selectedBlocker) {
                this.selectedBlocker = null;
                this.sync();
            }
        });
    }

    static declaresAt(step: StepIndex) {
        return step === StepIndex.DeclareAttackers || step === StepIndex.DeclareBlockers;
    }

    handleBlockerClick(object: CardObject): boolean {
        if (!(object instanceof Permanent) || game.hasPendingPlayerInput || game.currentStepIndex !== StepIndex.DeclareBlockers)
            return false;

        const actor = game.activePlayer();
        if (this.eligible.has(object)) {
            this.selectedBlocker = this.selectedBlocker === object ? null : object;
        } else if (this.selectedBlocker && CombatManager.attackingCreatures.has(object)) {
            if (!this.legalTargets.has(object)) {
                this.instruction.textContent = `${this.selectedBlocker.name} can’t block ${object.name}. Choose a highlighted attacker.`;
                return true;
            }

            new PlayerAction_DeclareBlocker(this.selectedBlocker).perform(actor, [object]);
            this.selectedBlocker = null;
        } else {
            return false;
        }

        this.sync();
        return true;
    }

    @autobind
    private withdrawBlock() {
        if (!this.selectedBlocker)
            return;

        new PlayerAction_DeclareBlocker(this.selectedBlocker).withdraw(game.activePlayer());
        this.selectedBlocker = null;
        this.sync();
    }

    @autobind
    private onStepEnd(event: GameEvent_StepEnd) {
        this.selectedBlocker = null;
        this.panel.hidden = true;
        if (event.stepIndex === StepIndex.DeclareAttackers)
            this.attackerSelection.setCards([]);
        if (event.stepIndex === StepIndex.EndOfCombat) {
            this.attackNumbers.clear();
            this.updateCards();
        }
    }

    @autobind
    private sync() {
        const step = game.currentStepIndex;
        const declaring = UICombat.declaresAt(step);
        const attacking = step === StepIndex.DeclareAttackers;
        const actor = game.activePlayer();
        const attackers = CombatManager.attackingCreatures;
        const blockers = CombatManager.blockingCreatures;

        this.eligible.clear();
        this.legalTargets.clear();
        if (declaring && actor) {
            for (const permanent of actor.battlefield.objects) {
                const actions = playerActionManager.getCardActions(permanent, actor);
                if (actions.some(action => action instanceof (attacking ? PlayerAction_DeclareAttacker : PlayerAction_DeclareBlocker)))
                    this.eligible.add(permanent);
            }
        }
        if (!this.eligible.has(this.selectedBlocker))
            this.selectedBlocker = null;

        if (attacking)
            this.attackerSelection.setCards(new Set([...this.eligible, ...attackers.keys()]), attackers.keys());

        if (this.selectedBlocker) {
            for (const attacker of CombatManager.potentialBlockTargetsFor(this.selectedBlocker))
                this.legalTargets.add(attacker);
        }

        for (const attacker of attackers.keys()) {
            if (!this.attackNumbers.has(attacker))
                this.attackNumbers.set(attacker, this.attackNumbers.size + 1);
        }
        this.updateCards();

        this.panel.hidden = !declaring;
        if (!declaring)
            return;

        const count = attacking ? attackers.size : blockers.size;
        const noun = attacking ? 'attacker' : 'block';
        this.heading.textContent = attacking ? 'Declare attackers' : 'Declare blockers';
        this.status.textContent = `Player ${actor?.id ?? '—'} · ${count} ${noun}${count === 1 ? '' : 's'} selected`;
        this.confirm.textContent = count ? (attacking ? 'Confirm attackers' : 'Confirm blocks') : (attacking ? 'No attacks' : 'No blocks');
        this.removeBlock.hidden = !this.selectedBlocker || !blockers.has(this.selectedBlocker);
        if (attacking) {
            this.instruction.textContent = 'Select highlighted creatures to attack.';
        } else if (this.selectedBlocker) {
            this.instruction.textContent = `Click a highlighted attacker for ${this.selectedBlocker.name} to block. Esc cancels selection.`;
        } else {
            this.instruction.textContent = 'Click a blue creature to block, then choose its attacker. Select an assigned blocker to edit it.';
        }
    }

    private updateCards() {
        const attackers = CombatManager.attackingCreatures;
        const blockers = CombatManager.blockingCreatures;
        const shown = new Set<UICard>();

        for (const permanent of new Set([...this.eligible, ...attackers.keys(), ...blockers.keys()])) {
            const view = this.root.getCardView(permanent);
            if (!view?.parent)
                continue;

            const target = blockers.get(permanent);
            const role = attackers.has(permanent) ? 'attack' : target ? 'block' : null;
            let colour = role === 'attack' ? ATTACK_COLOUR : role === 'block' ? BLOCK_COLOUR : null;
            if (this.legalTargets.has(permanent))
                colour = TARGET_COLOUR;
            else if (this.selectedBlocker === permanent)
                colour = BLOCK_COLOUR;
            else if (this.eligible.has(permanent) && !role && !this.selectedBlocker && game.currentStepIndex === StepIndex.DeclareBlockers)
                colour = ELIGIBLE_BLOCK_COLOUR;

            view.setCombatDisplay(role, colour, this.root.getCardView(target));
            shown.add(view);
        }

        for (const view of this.highlighted) {
            if (!shown.has(view))
                view.setCombatDisplay(null);
        }
        this.highlighted.clear();
        for (const view of shown)
            this.highlighted.add(view);

        for (const badge of this.badges.values())
            badge.destroy({ children: true });
        this.badges.clear();
        for (const link of this.links.removeChildren())
            link.destroy();

        for (const attacker of attackers.keys()) {
            const number = this.attackNumbers.get(attacker);
            if (this.legalTargets.has(attacker))
                this.addBadge(attacker, `Block attack ${number}`, TARGET_COLOUR);
            else
                this.addBadge(attacker, `Attack ${number}`, ATTACK_COLOUR);
        }
        for (const [blocker, attacker] of blockers) {
            const number = this.attackNumbers.get(attacker);
            const label = this.selectedBlocker === blocker ? `Editing block ${number}` : `Blocks ${number}`;
            this.addBadge(blocker, label, BLOCK_COLOUR);
            this.links.addChild(new PIXI.Graphics());
        }
        if (this.selectedBlocker && !blockers.has(this.selectedBlocker))
            this.addBadge(this.selectedBlocker, 'Choose target', BLOCK_COLOUR);
    }

    private addBadge(permanent: Permanent, label: string, colour: number) {
        const badge = new PIXI.Container();
        const text = new PIXI.Text({
            text: label,
            resolution: pixi.renderer.resolution,
            style: { fill: colour, fontFamily: 'system-ui', fontSize: 12, fontWeight: '700' },
        });
        text.anchor.set(0.5);
        const width = Math.ceil(text.width) + 18;
        const background = new PIXI.Graphics().roundRect(-width / 2, -11, width, 22, 8)
            .fill(0x081b24).stroke({ color: colour, width: 1 });
        badge.addChild(background, text);
        this.overlay.addChild(badge);
        this.badges.set(permanent, badge);
    }

    @autobind
    private positionOverlay() {
        for (const [permanent, badge] of this.badges) {
            const view = this.root.getCardView(permanent);
            badge.visible = Boolean(view?.parent);
            if (!badge.visible)
                continue;

            const bounds = view.art.getBounds();
            const bottomPlayer = this.root.players[0].player === permanent.controller;
            badge.position.set(bounds.x + bounds.width / 2, bottomPlayer ? bounds.y - 10 : bounds.y + bounds.height + 10);
        }

        let index = 0;
        for (const [blocker, attacker] of CombatManager.blockingCreatures) {
            const link = this.links.children[index++];
            const from = this.badges.get(blocker);
            const to = this.badges.get(attacker);
            if (!link)
                break;

            if (!from?.visible || !to?.visible) {
                link.clear();
                continue;
            }

            const direction = Math.sign(to.y - from.y);
            drawArrow(link, { x: from.x, y: from.y + 12 * direction }, { x: to.x, y: to.y - 12 * direction }, {
                color: BLOCK_COLOUR, lineWidth: 2.5, arrowheadLength: 12, alpha: 0.85,
            });
        }
    }
}
