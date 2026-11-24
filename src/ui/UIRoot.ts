import * as PIXI from "pixi.js";

import { ActionTarget,Targeter,TargetType } from "@engine/actions";
import playerActionManager from "@engine/actions/PlayerActionManager";
import Card from "@engine/Card";
import { GameEvent_ChangeCardZone, GameEvent_GoToNextPhase,GameEvent_GoToNextStep,GameEvent_GoToNextTurn } from "@engine/events";
import { GameEvent_StartTargeting } from "@engine/events/GameEvent_StartTargeting";
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
import uiEventManager,{
UIEvent_CardClicked,
UIEvent_CardDeselected,
UIEvent_CardSelected,
UIEventType
} from "@ui/UIEventManager";
import { UICombat } from "@ui/UICombat";
import { UIPlayer } from "@ui/UIPlayer";
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
    }

    @autobind
    private onStagePointerUp(event: PIXI.FederatedPointerEvent) {
        if (event.button === 2) {
            this.remove();
            this.onCancelled?.();
        }
    }

    @autobind
    private onCardTargetClicked(event: UIEvent_CardClicked) {
        const uiCard = uiRoot.cardToUICard.get(event.card);

        // TODO: Handle multi-targeting
        if (this.validateTargets([uiCard.card])) {
            this.target = uiCard;
            this.onTargeted([uiCard.card]);
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
    cardToUICard = new Map<Card, UICard>();

    private readonly zones = new Map<Zone, UIZone>();
    readonly cardOverlay = new PIXI.RenderLayer();
    readonly combat: UICombat;

    mousePos = new PIXI.Point();

    static init() {
        uiRoot = new UIRoot();
    }

    constructor() {
        super();

        this.cardOverlay.eventMode = 'none';
        pixi.stage.addChild(this.cardOverlay);
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, this.onCardChangedZone);
        pixi.renderer.on('resize', this.layoutPlayers);
        this.combat = new UICombat(this);

        const infiniteMana = document.createElement('input');
        infiniteMana.type = 'checkbox';
        infiniteMana.checked = game.infiniteMana;
        infiniteMana.addEventListener('change', () => {
            game.infiniteMana = infiniteMana.checked;
            playerActionManager.refreshCardActionsForUI();
        });
        const testingToggle = document.createElement('label');
        testingToggle.className = 'testing-toggle';
        testingToggle.title = 'Both players can cast spells without spending mana';
        testingToggle.append(infiniteMana, 'Infinite mana (testing)');
        document.body.append(testingToggle);

        gameEventManager.onPerformed(GameEventType.StartTargeting, (event: GameEvent_StartTargeting) => {
            removeCustomContextMenu();
            const request = event.targeter;
            if (request.targetType === TargetType.Player && request.count === 1) {
                this.showPlayerTargetDialog(request);
                return;
            }

            const targeter = new UITargeter(
                this.cardToUICard.get(request.source),
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

        // TODO: Probably need to clean these up
        const turnLabel = new DOMLabel("", { top: '125px', left: '25px' });
        const currentStepLabel = new DOMLabel("", { top: '150px', left: '25px' });
        const nextStepButton = new DOMButton("Next step", { top: '175px', left: '25px' }, () => gameEventManager.addEvent(new GameEvent_GoToNextStep()));
        const nextPhaseButton = new DOMButton("Next phase", { top: '225px', left: '25px' }, () => gameEventManager.addEvent(new GameEvent_GoToNextPhase()));
        const endTurnButton = new DOMButton("End turn", { top: '275px', left: '25px' }, () => gameEventManager.addEvent(new GameEvent_GoToNextTurn()));

        gameEventManager.onPerformed(GameEventType.TurnStart, () => turnLabel.text = `Player ${game.currentTurnPlayerID}'s turn`);
        gameEventManager.onPerformed(GameEventType.StepStart, () => {
            const declaring = UICombat.declaresAt(game.currentStepIndex);
            for (const control of [turnLabel, currentStepLabel, nextStepButton, nextPhaseButton, endTurnButton]) {
                if (declaring)
                    control.hide();
                else
                    control.show();
            }
            currentStepLabel.text = Step.toString(game.currentStepIndex);

            const nextPhase = (Step.phaseIndex(game.currentStepIndex) + 1) % Step.NUM_PHASES;
            nextPhaseButton.text = `Skip to ${Step.toStringPhase(nextPhase)}`;
        });

        uiEventManager.on(UIEventType.CardSelected, (event: UIEvent_CardSelected) => this.cardToUICard.get(event.card).setSelected(true));
        uiEventManager.on(UIEventType.CardDeselected, (event: UIEvent_CardDeselected) => this.cardToUICard.get(event.card).setSelected(false));

        pixi.stage.addEventListener('pointermove', (e) => this.mousePos.copyFrom(e.global));

        // TODO: Move this out
        {
            const stepMessageLabel = new DOMLabel("", { top: '0', left: '0', right: '0'});
            stepMessageLabel.className = "message";
            stepMessageLabel.hide();

            // TODO: Multiple buttons
            const stepActions = new DOMButton("", { top: '75px', left: '45%', right: '45%' }, null);
            stepActions.hide();

            gameEventManager.onPerformed(GameEventType.StepStart, () => {
                if (UICombat.declaresAt(game.currentStepIndex))
                    return;

                const message = game.currentStep().message;
                if (message) {
                    stepMessageLabel.text = message;
                    stepMessageLabel.show();
                }
                const action = game.currentStep().buttons[0];
                if (action) {
                    stepActions.text = action[0];
                    stepActions.onClick = action[1];
                    stepActions.show();
                }
            });

            gameEventManager.onPerformed(GameEventType.StepEnd, event => {
                removeCustomContextMenu();
                stepMessageLabel.text = null;
                stepMessageLabel.hide();

                stepActions.text = null;
                stepActions.onClick = null;
                stepActions.hide();
            });
        }
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
            dialog.close();
            dialog.remove();
        };
        const cancel = () => {
            close();
            request.onCancelled();
        };

        const choices = document.createElement('div');
        choices.className = 'spell-target-choices';
        for (const player of game.players) {
            if (!request.validateTargets([player]))
                continue;

            const button = document.createElement('button');
            button.textContent = player === request.source.controller ? 'Yourself' : `Player ${player.id}`;
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
        this.layoutPlayers();
    }

    @autobind
    private layoutPlayers() {
        this.players.forEach((player, index) => {
            player.position.set(pixi.screen.width / 2, index === 0 ? pixi.screen.height : 0);
            player.hand.updatePositions();
        });
    }

    @autobind
    private onCardChangedZone(event: GameEvent_ChangeCardZone) {
        const source = this.zones.get(event.oldZone);
        const destination = this.zones.get(event.newZone);
        let uiCard = this.cardToUICard.get(event.card);
        if (!uiCard && destination)
            uiCard = new UICard(event.card);
        if (!uiCard)
            return;

        const origin = uiCard.parent ? uiCard.getGlobalPosition() : undefined;
        if (source) {
            if (event.oldZone instanceof Battlefield && !(event.newZone instanceof Battlefield))
                source.animateExit(uiCard);
            source.removeCard(uiCard);
        }
        destination?.addCard(uiCard, origin);

        // A cast passes through the stack before becoming a permanent.
        if (event.newZone !== game.stack)
            uiCard.battlefieldDrop = undefined;
    }

    registerCard(uiCard: UICard) {
        if (uiRoot.cardToUICard.has(uiCard.card)) {
            console.error(`UI Card already exists for ${uiCard.card.def.name}`);
        }

        this.cardToUICard.set(uiCard.card, uiCard);
    }

    deregisterCard(uiCard: UICard) {
        this.cardToUICard.delete(uiCard.card);
    }
}

export let uiRoot: UIRoot;
