import * as PIXI from "pixi.js";

import { PlayerAction_DeclareAttacker,PlayerAction_DeclareBlocker } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { CardObject,Permanent } from "@engine/GameObject";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_Advance } from "@engine/events";
import type { CombatDamageChoice } from "@engine/events/GameEvent_CombatDamageChoice";
import type { GameEvent_StepEnd } from "@engine/events/GameEvent_Step";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { Step,StepIndex } from "@engine/Step";
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
    private readonly blockNumbers = new Map<Permanent, number>();
    private blockLinks: [Permanent, Permanent][] = [];
    private readonly highlighted = new Set<UICard>();
    private readonly panel = document.createElement('section');
    private readonly heading = document.createElement('h2');
    private readonly status = document.createElement('p');
    private readonly instruction = document.createElement('p');
    private readonly removeBlock = document.createElement('button');
    private readonly formBand = document.createElement('button');
    private readonly cancelBand = document.createElement('button');
    private readonly bandList = document.createElement('div');
    private readonly confirm = document.createElement('button');
    private readonly damageForm = document.createElement('form');
    private displayedDamageChoice?: CombatDamageChoice;
    private formingBand = false;
    private readonly bandSelection = new UICardSelection<Permanent>(() => this.sync());
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
        if (game.declarationPlayer && game.currentStepIndex === StepIndex.DeclareAttackers && !game.hasPendingPlayerInput)
            return this.formingBand ? this.bandSelection : this.attackerSelection;
    }

    get isSelectingAttackers() {
        return this.cardSelection === this.attackerSelection;
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
        this.cancelBand.textContent = 'Cancel band';
        this.cancelBand.addEventListener('click', this.cancelBandSelection);
        this.formBand.addEventListener('click', this.editBand);
        this.bandList.className = 'combat-band-list';
        this.damageForm.className = 'combat-damage-form';
        this.confirm.addEventListener('click', () => gameEventManager.addEvent(new GameEvent_Advance()));
        this.panel.append(this.heading, this.status, this.instruction, this.removeBlock,
            this.bandList, this.formBand, this.cancelBand, this.confirm, this.damageForm);
        document.body.append(this.panel);

        gameEventManager.onPerformed(GameEventType.StepStart, () => {
            this.sync();
            if (this.cardSelection)
                this.root.focusCardSelection();
        });
        gameEventManager.onPerformed(GameEventType.StepEnd, this.onStepEnd);
        gameEventManager.onPerformed(GameEventType.PriorityChanged, this.sync);
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.sync);
        gameEventManager.onPerformed(GameEventType.TapCard, this.sync);
        gameEventManager.onPerformed(GameEventType.UntapCard, this.sync);
        gameEventManager.onPerformed(GameEventType.RequestCombatDamageChoice, this.sync);
        gameEventManager.onPerformed(GameEventType.SubmitCombatDamageChoice, this.sync);
        window.addEventListener('keydown', event => {
            if (event.key !== 'Escape')
                return;

            if (this.formingBand) {
                this.cancelBandSelection();
            } else if (this.selectedBlocker) {
                this.selectedBlocker = null;
                this.sync();
            }
        });
    }

    handleBlockerClick(object: CardObject): boolean {
        if (!(object instanceof Permanent) || !game.declarationPlayer || game.hasPendingPlayerInput
            || game.currentStepIndex !== StepIndex.DeclareBlockers)
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
    private editBand() {
        if (this.formingBand) {
            const groups = CombatManager.attackingBands.map(band => [...band]);
            if (!CombatManager.setAttackingBands(game.activePlayer(), [...groups, this.bandSelection.selection]))
                return;
        }

        this.formingBand = !this.formingBand;
        this.bandSelection.setCards([]);
        this.sync();
        this.root.focusCardSelection();
    }

    @autobind
    private cancelBandSelection() {
        this.formingBand = false;
        this.bandSelection.setCards([]);
        this.sync();
        this.root.focusCardSelection();
    }

    @autobind
    private onStepEnd(event: GameEvent_StepEnd) {
        this.selectedBlocker = null;
        this.panel.hidden = true;
        if (event.stepIndex === StepIndex.DeclareAttackers) {
            this.formingBand = false;
            this.bandSelection.setCards([]);
            this.attackerSelection.setCards([]);
        }
        if (event.stepIndex === StepIndex.EndOfCombat) {
            this.attackNumbers.clear();
            this.blockNumbers.clear();
            this.updateCards();
        }
    }

    @autobind
    private sync() {
        const step = game.currentStepIndex;
        const declaring = !!game.declarationPlayer;
        const attacking = declaring && step === StepIndex.DeclareAttackers;
        const actor = game.activePlayer();
        const damageChoice = game.pendingCombatDamageChoice;
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

        if (attacking) {
            this.attackerSelection.setCards(new Set([...this.eligible, ...attackers.keys()]), attackers.keys());
            this.syncBandControls();
        }

        if (this.selectedBlocker) {
            for (const attacker of CombatManager.potentialBlockTargetsFor(this.selectedBlocker))
                this.legalTargets.add(attacker);
        }

        for (const attacker of attackers.keys()) {
            if (!this.attackNumbers.has(attacker))
                this.attackNumbers.set(attacker, this.attackNumbers.size + 1);
        }
        this.updateCards();

        this.panel.hidden = !declaring && !damageChoice;
        this.removeBlock.hidden = !declaring || !this.selectedBlocker || !blockers.has(this.selectedBlocker);
        this.removeBlock.textContent = blockers.get(this.selectedBlocker)?.size > 1 ? 'Remove blocks' : 'Remove block';
        this.bandList.hidden = !attacking || this.formingBand;
        this.formBand.hidden = !attacking || (!this.formingBand && this.formBand.disabled);
        this.cancelBand.hidden = !attacking || !this.formingBand;
        this.confirm.hidden = !declaring || this.formingBand;
        this.damageForm.hidden = !damageChoice;
        this.syncDamageChoice(damageChoice);
        if (!declaring)
            return;

        const count = attacking ? attackers.size : [...blockers.values()].reduce((total, targets) => total + targets.size, 0);
        const noun = attacking ? 'attacker' : 'block';
        this.heading.textContent = this.formingBand ? 'Form attacking band' : Step.toString(step);
        const selection = this.formingBand ? `${this.bandSelection.count} in this band`
            : `${count} ${noun}${count === 1 ? '' : 's'} selected`;
        this.status.textContent = `Player ${actor?.id ?? '—'} · ${selection}`;
        this.confirm.textContent = count ? (attacking ? 'Confirm attackers' : 'Confirm blocks') : (attacking ? 'No attacks' : 'No blocks');
        this.confirm.disabled = attacking ? !CombatManager.canConfirmAttackers() : !CombatManager.canConfirmBlocks();
        if (attacking) {
            this.instruction.textContent = this.formingBand
                ? 'Choose which attackers join this band. Up to one can lack banding.'
                : 'Select highlighted creatures to attack.';
        } else if (this.selectedBlocker) {
            this.instruction.textContent = `Click a highlighted attacker for ${this.selectedBlocker.name} to block. Esc cancels selection.`;
        } else if (this.confirm.disabled) {
            this.instruction.textContent = 'Assign every required block before confirming.';
        } else {
            this.instruction.textContent = 'Click a blue creature to block, then choose its attacker. Select an assigned blocker to edit it.';
        }
    }

    private syncBandControls() {
        const actor = game.activePlayer();
        const bands = CombatManager.attackingBands;
        const groups = bands.map(band => [...band]);
        const members = new Set(groups.flat());
        const available = [...CombatManager.attackingCreatures.keys()].filter(attacker => !members.has(attacker));
        const canFormBand = (members: readonly Permanent[]) => CombatManager.canSetAttackingBands(actor, [...groups, members]);

        this.formBand.textContent = this.formingBand ? 'Create band' : 'Form band';
        if (this.formingBand) {
            const chosen = this.bandSelection.selection.filter(card => available.includes(card));
            const selectable = available.filter(attacker => !chosen.length || chosen.includes(attacker) || canFormBand([...chosen, attacker]));
            this.bandSelection.setCards(selectable, chosen);
            this.formBand.disabled = chosen.length < 2 || !canFormBand(chosen);
        } else {
            this.formBand.disabled = available.length < 2 || !available.some(attacker => canFormBand([attacker]));
        }

        this.bandList.replaceChildren(...groups.map((group, index) => {
            const button = document.createElement('button');
            button.textContent = `Disband ${index + 1}`;
            button.setAttribute('aria-label', `Disband ${index + 1} (${group.map(card => card.name).join(', ')})`);
            button.addEventListener('click', () => {
                if (CombatManager.setAttackingBands(actor, groups.filter((_, i) => i !== index))) {
                    this.sync();
                    this.root.focusCardSelection();
                }
            });
            return button;
        }));
    }

    private syncDamageChoice(choice?: CombatDamageChoice) {
        if (this.displayedDamageChoice === choice)
            return;

        this.displayedDamageChoice = choice;
        this.damageForm.replaceChildren();
        this.damageForm.onsubmit = null;
        if (!choice)
            return;

        this.heading.textContent = 'Assign combat damage';
        this.status.textContent = `Player ${choice.player.id} · ${this.combatantName(choice.source)}`;
        this.instruction.textContent = `Divide ${choice.total} damage among these creatures.`;

        const inputs = choice.recipients.map(recipient => {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.max = String(choice.total);
            input.step = '1';
            input.required = true;
            input.value = '0';
            const label = document.createElement('label');
            label.append(this.combatantName(recipient), input);
            this.damageForm.append(label);
            return input;
        });

        const progress = document.createElement('p');
        progress.setAttribute('aria-live', 'polite');
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.textContent = 'Confirm damage';

        const update = () => {
            const assigned = inputs.reduce((total, input) => total + (input.valueAsNumber || 0), 0);
            progress.textContent = `${assigned} of ${choice.total} assigned`;
            submit.disabled = assigned !== choice.total || !this.damageForm.checkValidity();
        };
        for (const input of inputs)
            input.addEventListener('input', update);
        this.damageForm.append(progress, submit);
        this.damageForm.onsubmit = event => {
            event.preventDefault();
            if (!submit.disabled)
                choice.submit(choice.player, inputs.map(input => input.valueAsNumber));
        };
        update();
        inputs[0].focus();
    }

    private combatantName(permanent: Permanent) {
        return this.attackNumbers.has(permanent)
            ? `${permanent.name} (attack ${this.attackNumbers.get(permanent)})`
            : `${permanent.name} (blocker ${this.blockNumbers.get(permanent)})`;
    }

    private updateCards() {
        const attackers = CombatManager.attackingCreatures;
        const choice = game.pendingCombatDamageChoice;
        const bandNumbers = new Map<Permanent, number>();
        const bands = CombatManager.attackingBands;
        bands.forEach((band, index) => {
            for (const member of band)
                bandNumbers.set(member, index + 1);
        });
        if (this.formingBand) {
            for (const member of this.bandSelection.selection)
                bandNumbers.set(member, bands.length + 1);
        }

        this.blockLinks = [...CombatManager.blockRelationships()];
        const blockedAttackers = new Map<Permanent, Permanent[]>();
        for (const [blocker, attacker] of this.blockLinks) {
            const targets = blockedAttackers.get(blocker) ?? [];
            targets.push(attacker);
            blockedAttackers.set(blocker, targets);
            if (!this.blockNumbers.has(blocker))
                this.blockNumbers.set(blocker, this.blockNumbers.size + 1);
        }
        const shown = new Set<UICard>();

        for (const permanent of new Set([...this.eligible, ...attackers.keys(), ...blockedAttackers.keys()])) {
            const view = this.root.getCardView(permanent);
            if (!view?.parent)
                continue;

            const target = CombatManager.blockingCreatures.get(permanent)?.values().next().value
                ?? blockedAttackers.get(permanent)?.[0];
            const role = attackers.has(permanent) ? 'attack' : target ? 'block' : null;
            let colour = role === 'block' ? BLOCK_COLOUR : null;
            if (this.legalTargets.has(permanent) || choice?.recipients.includes(permanent))
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
            const band = bandNumbers.get(attacker);
            const legal = this.legalTargets.has(attacker);
            const label = `${legal ? 'Block attack' : 'Attack'} ${number}${band ? ` - Band ${band}` : ''}`;
            this.addBadge(attacker, label, legal ? TARGET_COLOUR : ATTACK_COLOUR);
        }
        for (const [blocker, targets] of blockedAttackers) {
            const number = this.blockNumbers.get(blocker);
            const attacks = targets.map(attacker => this.attackNumbers.get(attacker)).join(', ');
            const label = this.selectedBlocker === blocker ? `Editing blocker ${number}` : `Blocker ${number} · ${attacks}`;
            this.addBadge(blocker, label, BLOCK_COLOUR);
        }
        this.blockLinks.forEach(() => this.links.addChild(new PIXI.Graphics()));
        if (this.selectedBlocker && !blockedAttackers.has(this.selectedBlocker))
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
        for (const [blocker, attacker] of this.blockLinks) {
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
