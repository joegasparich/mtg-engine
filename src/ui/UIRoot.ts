import * as PIXI from "pixi.js";

import { ActionTarget,Targeter,TargetType } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import { CardObject,Permanent } from "@engine/GameObject";
import { GameEvent_Advance,GameEvent_ChangeCardZone,type GameEvent_TurnStart } from "@engine/events";
import type { GameEvent_DealDamage } from "@engine/events/GameEvent_DealDamage";
import { GameEvent_StartTargeting } from "@engine/events/GameEvent_StartTargeting";
import type { GameEvent_RequestResolutionChoice } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import Player from "@engine/Player";
import { Battlefield, Zone } from "@engine/Zone";
import { Step } from "@engine/Step";
import { removeCustomContextMenu } from "@ui/contextMenu";
import DOMButton from "@ui/dom/DOMButton";
import DOMLabel from "@ui/dom/DOMLabel";
import { drawArrow } from "@ui/drawUtility";
import UICard from "@ui/UICard";
import uiEventManager,{ UIEvent_CardClicked,UIEventType } from "@ui/UIEventManager";
import { UICombat } from "@ui/UICombat";
import { UIPlayer } from "@ui/UIPlayer";
import { UIResolutionChoice } from "@ui/UIResolutionChoice";
import { UIStack } from "@ui/UIStack";
import { UIZone } from "@ui/UIZone";
import { autobind } from "@utility/typeUtility";

export const pixi = new PIXI.Application();

export async function initRenderer() {
    await pixi.init({
        background: '#102a30',
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        resizeTo: window,
    });
    pixi.canvas.addEventListener('contextmenu', event => event.preventDefault());
    document.body.appendChild(pixi.canvas);
    pixi.stage.eventMode = 'static';
    pixi.stage.hitArea = pixi.screen;
}

const playerRotations = [
    0,
    180
];

type UITarget = UICard | UIPlayer;

export class UITargeter {
    source: UICard;
    private readonly sourceObject?: CardObject;
    targetType: TargetType;
    count: number;

    target: UITarget;

    arrow: PIXI.Graphics;
    playerAreas: PIXI.Graphics[] = [];

    validateTargets: (targets: ActionTarget[]) => boolean;
    onTargeted: (targets: ActionTarget[]) => void;
    onCancelled: () => void;

    constructor(source: UICard, targetType: TargetType, count: number, validateTargets: (target: ActionTarget[]) => boolean, onTargeted: (targets: ActionTarget[]) => void, onCancelled: () => void | null) {
        this.source = source;
        this.sourceObject = source?.object;
        this.targetType = targetType;
        this.count = count;
        this.validateTargets = validateTargets;
        this.onTargeted = onTargeted;
        this.onCancelled = onCancelled;

        this.arrow = new PIXI.Graphics();
        this.arrow.eventMode = "none";
        pixi.stage.addChild(this.arrow);

        this.arrow.onRender = (renderer: PIXI.Renderer) => {
            const p1 = this.source?.getGlobalPosition() ?? new PIXI.Point(pixi.screen.width / 2, pixi.screen.height / 2);
            const p2 = this.target ? this.target.getGlobalPosition() : uiRoot.mousePos;

            drawArrow(this.arrow, p1, p2, {
                color: 0xff0000,
                lineWidth: 5,
                arrowheadLength: 25,
                arrowheadAngle: Math.PI / 6,
                alpha: 0.8
            });
        };

        if ((targetType & TargetType.Card) != 0)
            uiEventManager.on(UIEventType.CardClicked, this.onCardTargetClicked);

        if ((targetType & TargetType.Player) != 0) {
            for (const player of game.players) {
                const area = new PIXI.Graphics();
                area.rect(-50, -50, 100, 100);
                area.fill(0xde3249);
                area.eventMode = "static";
                area.on('pointerup', this.onPlayerAreaClicked);
                this.playerAreas.push(area);
                uiRoot.playerToUIPlayer.get(player).addChild(area);
            }
        }

        pixi.stage.on('pointerup', this.onStagePointerUp);
        gameEventManager.onPerformed(GameEventType.StepEnd, this.remove);
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.onSourceMoved);
    }

    @autobind
    private onStagePointerUp(event: PIXI.FederatedPointerEvent) {
        if (event.button === 2) {
            this.remove();
            this.onCancelled?.();
        }
    }

    @autobind
    private onSourceMoved(event: GameEvent_ChangeCardZone) {
        if (event.oldObject === this.sourceObject) {
            this.remove();
            this.onCancelled?.();
        }
    }

    @autobind
    private onCardTargetClicked(event: UIEvent_CardClicked) {
        const uiCard = uiRoot.getCardView(event.object);

        // TODO: Handle multi-targeting
        if (uiCard && this.validateTargets([event.object])) {
            this.target = uiCard;
            this.onTargeted([event.object]);
        }
    }

    @autobind
    onPlayerAreaClicked(event: PIXI.FederatedPointerEvent) {
        if (event.button !== 0)
            return;

        const uiPlayer = event.target.parent as UIPlayer;

        // TODO: Handle multi-targeting
        if (this.validateTargets([uiPlayer.player])) {
            this.target = uiPlayer;
            this.onTargeted([uiPlayer.player]);
        }
    }

    @autobind
    remove() {
        gameEventManager.offPerformed(GameEventType.StepEnd, this.remove);
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, this.onSourceMoved);
        pixi.stage.off('pointerup', this.onStagePointerUp);
        pixi.stage.removeChild(this.arrow);

        if ((this.targetType & TargetType.Player) != 0) {
            for (const area of this.playerAreas) {
                area.parent.removeChild(area);
            }

            this.playerAreas.length = 0;
        }

        if ((this.targetType & TargetType.Card) != 0)
            uiEventManager.off(UIEventType.CardClicked, this.onCardTargetClicked);
    }
}

export default class UIRoot extends PIXI.Container {
    players: UIPlayer[] = [];
    playerToUIPlayer = new Map<Player, UIPlayer>();
    uiPlayerToPlayer = new Map<UIPlayer, Player>();
    cardToUICard = new Map<number, UICard>();

    private readonly zones = new Map<Zone, UIZone<PIXI.Container>>();
    private readonly stack: UIStack;
    readonly cardOverlay = new PIXI.RenderLayer();
    readonly combat: UICombat;
    private resolutionChoice?: UIResolutionChoice;
    private readonly selectionStatus = document.createElement('p');
    private readonly lifeTotalsPanel = document.createElement('aside');
    private readonly lifeTotals = new Map<Player, HTMLElement>();

    get cardSelection() {
        return this.resolutionChoice ? this.resolutionChoice.cardSelection : this.combat.cardSelection;
    }

    mousePos = new PIXI.Point();

    static init() {
        uiRoot = new UIRoot();
    }

    constructor() {
        super();

        this.cardOverlay.eventMode = 'none';
        pixi.stage.addChild(this.cardOverlay);
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
        pixi.renderer.on('resize', this.layoutBoard);
        this.combat = new UICombat(this);
        this.stack = new UIStack(game.stack, this);
        this.zones.set(game.stack, this.stack);
        pixi.stage.addChild(this.stack);
        this.setupCardSelectionKeyboard();

        this.lifeTotalsPanel.className = 'life-totals';
        this.lifeTotalsPanel.setAttribute('aria-label', 'Life totals');
        this.lifeTotalsPanel.setAttribute('aria-live', 'polite');
        document.body.append(this.lifeTotalsPanel);
        gameEventManager.onPerformed(GameEventType.DealDamage, (event: GameEvent_DealDamage) => {
            if (event.recipient instanceof Player)
                this.updateLifeTotal(event.recipient);
        });

        const devControls = document.createElement('div');
        devControls.className = 'testing-controls';
        const addDevCheckbox = (text: string, checked: boolean, onChange: (enabled: boolean) => void) => {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = checked;
            input.addEventListener('change', () => onChange(input.checked));
            const label = document.createElement('label');
            label.className = 'testing-toggle';
            label.append(input, text);
            devControls.append(label);
        };
        addDevCheckbox('Infinite mana (testing)', game.infiniteMana, enabled => {
            game.infiniteMana = enabled;
            playerActionManager.refreshCardActionsForUI();
        });
        addDevCheckbox('Auto-pass priority (testing)', game.autoPassPriority, enabled => {
            game.autoPassPriority = enabled;
            game.checkState();
        });
        document.body.append(devControls);

        gameEventManager.onPerformed(GameEventType.StartTargeting, (event: GameEvent_StartTargeting) => {
            removeCustomContextMenu();
            const request = event.targeter;
            if (request.targetType === TargetType.Player && request.count === 1) {
                this.showPlayerTargetDialog(request);
                return;
            }

            const targeter = new UITargeter(
                this.getCardView(request.source),
                request.targetType,
                request.count,
                request.validateTargets,
                targets => {
                    targeter.remove();
                    request.onTargeted(targets);
                },
                request.onCancelled
            );
        });

        gameEventManager.onPerformed(GameEventType.RequestResolutionChoice, (event: GameEvent_RequestResolutionChoice) => {
            removeCustomContextMenu();
            this.resolutionChoice?.close();
            document.body.classList.add('resolving-choice');
            this.selectionStatus.textContent = '';
            this.resolutionChoice = new UIResolutionChoice(this, event.choice);
            this.resolutionChoice.open();
        });
        gameEventManager.onPerformed(GameEventType.SubmitResolutionChoice, () => {
            this.resolutionChoice?.close();
            this.resolutionChoice = undefined;
            this.selectionStatus.textContent = '';
            document.body.classList.remove('resolving-choice');
        });

        const turnLabel = new DOMLabel("", { top: '125px', left: '25px' });
        const currentStepLabel = new DOMLabel("", { top: '150px', left: '25px' });
        const advanceButton = new DOMButton("", { top: '175px', left: '25px' },
            () => gameEventManager.addEvent(new GameEvent_Advance()));
        const turnControls = [turnLabel, currentStepLabel, advanceButton];
        for (const control of turnControls)
            control.className = 'turn-control';

        const syncTurnControls = () => {
            const hidden = game.declarationPlayer || game.pendingCombatDamageChoice;
            for (const control of turnControls) {
                if (hidden)
                    control.hide();
                else
                    control.show();
            }
            const priority = game.priorityPlayer;
            currentStepLabel.text = Step.toString(game.currentStepIndex);
            advanceButton.text = game.canEndTurn ? "End turn"
                : priority ? `Player ${priority.id} · Pass priority` : "Next step";
        };
        gameEventManager.onPerformed(GameEventType.TurnStart, (event: GameEvent_TurnStart) => turnLabel.text = `Player ${event.player.id}'s turn`);
        gameEventManager.onPerformed(GameEventType.PriorityChanged, () => {
            removeCustomContextMenu();
            for (const player of this.lifeTotals.keys())
                this.updateLifeTotal(player);
            syncTurnControls();
        });
        gameEventManager.onPerformed(GameEventType.RequestCombatDamageChoice, () => {
            removeCustomContextMenu();
            syncTurnControls();
        });
        gameEventManager.onPerformed(GameEventType.SubmitCombatDamageChoice, syncTurnControls);
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, syncTurnControls);
        gameEventManager.onPerformed(GameEventType.StackAbilityChanged, syncTurnControls);
        gameEventManager.onPerformed(GameEventType.StepStart, () => {
            this.announceCardSelection();
            syncTurnControls();
        });
        gameEventManager.onPerformed(GameEventType.StepEnd, removeCustomContextMenu);

        pixi.stage.addEventListener('pointermove', (e) => this.mousePos.copyFrom(e.global));
    }

    handleCardClick(object: CardObject) {
        if (this.cardSelection?.toggle(object)) {
            this.announceCardSelection();
            return;
        }
        if (!this.resolutionChoice && !this.combat.handleBlockerClick(object))
            uiEventManager.fire(new UIEvent_CardClicked(object));
    }

    focusCardSelection() {
        if (this.cardSelection?.focusedCard)
            pixi.canvas.focus();
        this.announceCardSelection();
    }

    setVisibleHands(only?: Player | null) {
        for (const { player, hand } of this.players) {
            for (const view of hand.children)
                view.clearPreview();
            hand.visible = only === undefined || only === player;
        }
    }

    private setupCardSelectionKeyboard() {
        const canvas = pixi.canvas;
        let handledSpace = false;
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', 'Game board. Use arrow keys and Space when choosing cards.');
        this.selectionStatus.className = 'visually-hidden';
        this.selectionStatus.setAttribute('role', 'status');
        document.body.append(this.selectionStatus);

        canvas.addEventListener('focus', () => this.announceCardSelection());
        canvas.addEventListener('blur', () => { handledSpace = false; });
        canvas.addEventListener('keydown', event => {
            const selection = this.cardSelection;
            if (!selection)
                return;

            if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                selection.moveFocus(1);
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                selection.moveFocus(-1);
            else if (event.key === ' ' || event.key === 'Enter') {
                if (!event.repeat) {
                    handledSpace = event.key === ' ';
                    selection.toggle(selection.focusedCard);
                }
            } else {
                return;
            }
            event.preventDefault();
            this.announceCardSelection();
        });
        canvas.addEventListener('keyup', event => {
            if (event.key === ' ' && (handledSpace || this.cardSelection)) {
                handledSpace = false;
                event.stopPropagation();
            }
        });
    }

    private announceCardSelection() {
        const selection = this.cardSelection;
        const card = selection?.focusedCard;
        this.selectionStatus.textContent = card
            ? `${card.name}${card instanceof Permanent && card.tapped ? ', tapped' : ''}${selection.stateFor(card) === 'selected' ? ', selected' : ''}`
            : '';
    }

    private showPlayerTargetDialog(request: Targeter) {
        const dialog = document.createElement('dialog');
        dialog.className = 'spell-target-dialog';
        const heading = document.createElement('h2');
        heading.id = 'spell-target-heading';
        heading.textContent = `Choose a player for ${request.source.name}`;
        dialog.setAttribute('aria-labelledby', heading.id);
        dialog.append(heading);

        const close = () => {
            gameEventManager.offPerformed(GameEventType.ChangeCardZone, onSourceMoved);
            dialog.close();
            dialog.remove();
        };
        const cancel = () => {
            close();
            request.onCancelled();
        };
        const onSourceMoved = (event: GameEvent_ChangeCardZone) => {
            if (event.oldObject === request.source)
                cancel();
        };

        const choices = document.createElement('div');
        choices.className = 'spell-target-choices';
        for (const player of game.players) {
            if (!request.validateTargets([player]))
                continue;

            const button = document.createElement('button');
            button.textContent = player === request.source.owner ? 'Yourself' : `Player ${player.id}`;
            button.addEventListener('click', () => {
                close();
                request.onTargeted([player]);
            });
            choices.append(button);
        }

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', cancel);
        choices.append(cancelButton);
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            cancel();
        });

        dialog.append(choices);
        document.body.append(dialog);
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, onSourceMoved);
        dialog.showModal();
    }

    onPlayerAdded(player: Player) {
        if (this.players.length >= playerRotations.length) {
            console.log("Already at max players!!");
            return;
        }

        const uiPlayer = new UIPlayer(player, new PIXI.Point(), playerRotations[this.players.length]);
        pixi.stage.addChildAt(uiPlayer, pixi.stage.getChildIndex(this.cardOverlay));
        this.zones.set(player.hand, uiPlayer.hand);
        this.zones.set(player.battlefield, uiPlayer.battlefield);
        this.players.push(uiPlayer);
        this.playerToUIPlayer.set(player, uiPlayer);
        this.uiPlayerToPlayer.set(uiPlayer, player);
        const lifeTotal = document.createElement('span');
        this.lifeTotals.set(player, lifeTotal);
        this.updateLifeTotal(player);
        this.lifeTotalsPanel.append(lifeTotal);
        this.layoutBoard();
    }

    private updateLifeTotal(player: Player) {
        const label = this.lifeTotals.get(player);
        const text = `Player ${player.id} · ${player.life} life`;
        if (label && label.textContent !== text)
            label.textContent = text;
    }

    @autobind
    private layoutBoard() {
        this.players.forEach((player, index) => {
            player.position.set(pixi.screen.width / 2, index === 0 ? pixi.screen.height : 0);
            player.hand.updatePositions();
        });
        this.stack.layout();
    }

    @autobind
    private onCardChangedZone(event: GameEvent_ChangeCardZone) {
        const { oldObject, newObject } = event;
        let view = this.getCardView(oldObject);
        const source = view?.battlefieldGroup?.battlefield ?? this.zones.get(event.oldZone);
        const host = newObject instanceof Permanent ? this.getCardView(newObject.attachedTo) : undefined;
        const destination = host?.battlefieldGroup?.battlefield ?? this.zones.get(event.newZone);

        if (view) {
            const origin = view.parent ? view.getGlobalPosition() : undefined;
            if (source && view.parent) {
                if (event.oldZone instanceof Battlefield && !(event.newZone instanceof Battlefield))
                    source.animateExit(view);
                source.removeCard(view);
            }
            view.object = newObject;
            destination?.addCard(view, origin);
        } else if (destination) {
            view = new UICard(newObject);
            destination.addCard(view);
        }

        // Preserve the hand drag coordinates through the intermediate stack object.
        if (view && event.newZone !== game.stack)
            view.battlefieldDrop = undefined;
    }

    getCardView(object?: CardObject): UICard | undefined {
        const view = object && this.cardToUICard.get(object.card.id);
        return view?.object === object ? view : undefined;
    }

    registerCard(view: UICard) {
        this.cardToUICard.set(view.card.id, view);
    }
}

export let uiRoot: UIRoot;
