import * as PIXI from "pixi.js";

import Player from "../engine/Player";
import {UIPlayer} from "./UIPlayer";
import DOMButton from "./dom/DOMButton";
import {game} from "../engine/Game";
import DOMLabel from "./dom/DOMLabel";
import gameEventManager, { GameEventType } from "../engine/events/GameEventManager";
import {Step} from "../engine/Step";
import Card from "../engine/Card";
import UICard from "./UICard";
import uiEventManager, {
    UIEvent_CardClicked,
    UIEvent_CardDeselected,
    UIEvent_CardSelected,
    UIEventType
} from "./UIEventManager";
import {autobind} from "../utility/typeUtility";
import {drawArrow} from "./drawUtility";
import {GameEvent_GoToNextPhase, GameEvent_GoToNextStep, GameEvent_GoToNextTurn} from "../engine/events";
import {ActionTarget} from "../engine/actions";

export let pixi: PIXI.Application = null;

pixi = new PIXI.Application();
await pixi.init({ background: '#1099bb', resizeTo: window });
document.body.appendChild(pixi.canvas);
pixi.stage.eventMode = 'static';
pixi.stage.hitArea = pixi.screen;

const playerPositions = [
    new PIXI.Point(pixi.screen.width/2, pixi.screen.height),
    new PIXI.Point(pixi.screen.width/2, 0),
];
const playerRotations = [
    0,
    180
];

export enum TargetType {
    None = 0,
    Player = 1 << 0,
    Card = 1 << 1,
}

type UITarget = UICard | UIPlayer;

export class UITargeter {
    source: UICard;
    targetType: TargetType;

    target: UITarget;

    arrow: PIXI.Graphics;
    playerAreas: PIXI.Graphics[] = [];

    validateTarget: (target: ActionTarget) => boolean;
    onTargeted: (target: ActionTarget) => void;
    onCancelled: () => void;

    constructor(source: UICard, targetType: TargetType, validateTarget: (target: ActionTarget) => boolean, onTargeted: (target: ActionTarget) => void, onCancelled: () => void | null) {
        this.source = source;
        this.targetType = targetType;
        this.validateTarget = validateTarget;
        this.onTargeted = onTargeted;
        this.onCancelled = onCancelled;

        this.arrow = new PIXI.Graphics();
        this.arrow.eventMode = "none";
        pixi.stage.addChild(this.arrow);

        this.arrow.onRender = (renderer: PIXI.Renderer) => {
            const p1 = this.source.getGlobalPosition();
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
            uiEventManager.on(UIEventType.CardClicked, (event: UIEvent_CardClicked) => this.onCardClicked(event.card));

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

        pixi.stage.on('pointerup', event => {
            if (event.button == 2) {
                this.onCancelled?.();
                this.remove();
            }
        });
    }

    @autobind
    onCardClicked(card: Card) {
        const uiCard = uiRoot.cardToUICard.get(card);

        if (this.validateTarget(uiCard.card)) {
            this.target = uiCard;
            this.onTargeted(uiCard.card);
        }
    }

    @autobind
    onPlayerAreaClicked(event: PIXI.FederatedPointerEvent) {
        const uiPlayer = event.target.parent as UIPlayer;

        if (this.validateTarget(uiPlayer.player)) {
            this.target = uiPlayer;
            this.onTargeted(uiPlayer.player);
        }
    }

    remove() {
        pixi.stage.removeChild(this.arrow);

        if ((this.targetType & TargetType.Player) != 0) {
            for (const area of this.playerAreas) {
                area.parent.removeChild(area);
            }

            this.playerAreas.length = 0;
        }

        if ((this.targetType & TargetType.Card) != 0)
            uiEventManager.off(UIEventType.CardClicked, (event: UIEvent_CardClicked) => this.onCardClicked(event.card));
    }
}

export default class UIRoot extends PIXI.Container {
    players: UIPlayer[] = [];
    playerToUIPlayer = new Map<Player, UIPlayer>();
    uiPlayerToPlayer = new Map<UIPlayer, Player>();
    cardToUICard = new Map<Card, UICard>();

    mousePos = new PIXI.Point();

    static init() {
        uiRoot = new UIRoot();
    }

    constructor() {
        super();

        // TODO: Probably need to clean these up
        const turnLabel = new DOMLabel("", { top: '125px', left: '25px' });
        const currentStepLabel = new DOMLabel("", { top: '150px', left: '25px' });
        const nextStepButton = new DOMButton("Next step", { top: '175px', left: '25px' }, () => gameEventManager.addEvent(new GameEvent_GoToNextStep()));
        const nextPhaseButton = new DOMButton("Next phase", { top: '225px', left: '25px' }, () => gameEventManager.addEvent(new GameEvent_GoToNextPhase()));
        const endTurnButton = new DOMButton("End turn", { top: '275px', left: '25px' }, () => gameEventManager.addEvent(new GameEvent_GoToNextTurn()));

        gameEventManager.on(GameEventType.TurnStart, () => turnLabel.text = `Player ${game.currentTurnPlayerID}'s turn`);
        gameEventManager.on(GameEventType.StepStart, () => {
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

            gameEventManager.on(GameEventType.StepStart, event => {
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

            gameEventManager.on(GameEventType.StepEnd, event => {
                stepMessageLabel.text = null;
                stepMessageLabel.hide();

                stepActions.text = null;
                stepActions.onClick = null;
                stepActions.hide();
            });
        }
    }

    onPlayerAdded(player: Player) {
        if (this.players.length >= playerPositions.length) {
            console.log("Already at max players!!");
            return;
        }

        const uiPlayer = new UIPlayer(player, playerPositions[this.players.length], playerRotations[this.players.length]);
        pixi.stage.addChild(uiPlayer);
        this.players.push(uiPlayer);
        this.playerToUIPlayer.set(player, uiPlayer);
        this.uiPlayerToPlayer.set(uiPlayer, player);
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
