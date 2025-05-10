import * as PIXI from "pixi.js";

import Player from "../engine/Player";
import {UIPlayer} from "./UIPlayer";
import DOMButton from "./dom/DOMButton";
import {game} from "../engine/root";
import DOMLabel from "./dom/DOMLabel";
import gameEventManager, {GameEventType} from "../engine/events/GameEventManager";
import {Step} from "../engine/Step";
import Card from "../engine/Card";
import UICard from "./UICard";
import uiEventManager, {UIEvent_CardDeselected, UIEvent_CardSelected, UIEventType} from "./UIEventManager";

export let pixi: PIXI.Application = null;

pixi = new PIXI.Application();
await pixi.init({ background: '#1099bb', resizeTo: window });
document.body.appendChild(pixi.canvas);
pixi.stage.eventMode = 'static';
pixi.stage.hitArea = pixi.screen;

const playerPositions = [
    new PIXI.Point(pixi.screen.width/2, pixi.screen.height/2),
    new PIXI.Point(pixi.screen.width/2, pixi.screen.height/2),
]
const playerRotations = [
    0,
    180
]

export default class UIRoot extends PIXI.Container {
    players: UIPlayer[] = [];
    playerToUIPlayer = new Map<Player, UIPlayer>();
    uiPlayerToPlayer = new Map<UIPlayer, Player>();
    cardToUICard = new Map<Card, UICard>();

    constructor() {
        super();

        // TODO: Probably need to clean these up
        const turnLabel = new DOMLabel("", { top: '125px', left: '25px' });
        const currentStepLabel = new DOMLabel("", { top: '150px', left: '25px' });
        const nextStepButton = new DOMButton("Next step", { top: '175px', left: '25px' }, () => game.nextStep());
        const nextPhaseButton = new DOMButton("Next phase", { top: '225px', left: '25px' }, () => game.skipToNextPhase())
        const endTurnButton = new DOMButton("End turn", { top: '275px', left: '25px' }, () => game.skipToNextTurn());

        gameEventManager.on(GameEventType.TurnStart, () => turnLabel.text = `Player ${game.currentTurnPlayerID}'s turn`);
        gameEventManager.on(GameEventType.StepStart, () => {
            currentStepLabel.text = Step.toString(game.currentStepIndex);

            const nextPhase = (Step.phaseIndex(game.currentStepIndex) + 1) % Step.NUM_PHASES;
            nextPhaseButton.text = `Skip to ${Step.toStringPhase(nextPhase)}`;
        });

        uiEventManager.on(UIEventType.CardSelected, (event: UIEvent_CardSelected) => this.cardToUICard.get(event.card).setSelected(true));
        uiEventManager.on(UIEventType.CardDeselected, (event: UIEvent_CardDeselected) => this.cardToUICard.get(event.card).setSelected(false));
    }

    onPlayerAdded(player: Player) {
        if (this.players.length >= playerPositions.length) {
            console.log("Already at max players!!")
            return;
        }

        const uiPlayer = new UIPlayer(player, playerPositions[this.players.length], playerRotations[this.players.length]);
        pixi.stage.addChild(uiPlayer);
        this.players.push(uiPlayer);
        this.playerToUIPlayer.set(player, uiPlayer);
        this.uiPlayerToPlayer.set(uiPlayer, player);
    }

    registerCard(uiCard: UICard) {
        this.cardToUICard.set(uiCard.card, uiCard);
    }

    deregisterCard(uiCard: UICard) {
        this.cardToUICard.delete(uiCard.card);
    }
}
