import {CardDef} from "./CardDef";
import  * as PIXI from "pixi.js";
import {game, loadImageFromExternalUrl, pixi} from "./renderer";
import {activatedAbilitiesCosts} from "./workers";
import {PlayerAction, PlayerAction_ActivatedAbility, PlayerAction_PlayCard} from "./PlayerAction";
import {showCustomContextMenu} from "./contextMenu";
import {Battlefield, Hand, Zone} from "./Zone";

const CARD_WIDTH = 125;
const CARD_HEIGHT = 175;

export default class Card extends PIXI.Sprite {
    // Ownership
    readonly ownerID: number;
    controllerID: number;

    readonly def: CardDef;

    // State
    zone: Zone;
    tapped = false;

    // Characteristics (eventually copy over everything from def
    cost: number[]; // W U B R G Colourless Any

    constructor(cardDef: CardDef, ownerID: number) {
        super()
        this.def = cardDef;
        this.ownerID = ownerID;
        this.controllerID = ownerID;

        if (cardDef.cost)
            this.parseCost(cardDef.cost)

        loadImageFromExternalUrl(cardDef.image_url).then(tex => this.texture = tex)
        this.width = CARD_WIDTH;
        this.height = CARD_HEIGHT;
        this.anchor = new PIXI.Point(0.5, 0.5);

        // Events
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointerdown', this.onMouseDownBound);
        this.on('pointerup', this.onMouseUpBound);
        pixi.stage.on('pointerup', this.globalMouseUpBound);
        pixi.stage.on('pointerupoutside', this.globalMouseUpBound);
    }

    // TODO: Put this somewhere better
    getActions(actorID: number): PlayerAction[] {
        const actions: PlayerAction[] = [];

        if (actorID != this.controllerID)
            return actions;

        const player = game.players[actorID];

        if (this.zone instanceof Hand) {
            if (player.manaPool.canPay(this.cost) && this.canPlay()) {
                actions.push(new PlayerAction_PlayCard(this));
            }
        }

        if (this.zone instanceof Battlefield) {
            if (this.def.activated_abilities) {
                for (const abilityData of this.def.activated_abilities) {
                    if (activatedAbilitiesCosts.get(abilityData.cost).payable(this, actorID)) {
                        actions.push(new PlayerAction_ActivatedAbility(abilityData, this));
                    }
                }
            }
        }

        return actions;
    }

    public Tapped() { return this.tapped }
    public OnTap() {
        this.angle = 90;
    }
    public OnUntap() {
        this.angle = 0;
    }

    preDragPos: PIXI.Point;
    onDrag(event: PIXI.FederatedPointerEvent) {
        this.parent.toLocal(event.global, null, this.position);
    }

    onMouseDown(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            this.alpha = 0.5;
            this.preDragPos = this.position.clone();
            pixi.stage.on('pointermove', this.onDragBound);
        }
    }

    onMouseUp(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            if (!(this.zone instanceof Battlefield))
                this.position = this.preDragPos;
        }
        if (event.button == 2) {
            const actions = this.getActions(game.currentTurnPlayerID);

            if (actions.length > 0) {
                showCustomContextMenu(event.global, actions.map(a => a.label()), index => {
                    game.currentPlayer().performAction(actions[index]);
                }, event);
            }
        }
    }

    globalMouseUp(event: PIXI.FederatedPointerEvent) {
        if (event.button == 0) {
            pixi.stage.off('pointermove', this.onDragBound);
            this.alpha = 1;
        }
    }

    onMouseDownBound = this.onMouseDown.bind(this);
    onMouseUpBound = this.onMouseUp.bind(this);
    globalMouseUpBound = this.globalMouseUp.bind(this);
    onDragBound = this.onDrag.bind(this);

    parseCost(cost: string) {
        this.cost = [0, 0, 0, 0, 0, 0, 0];
        const pips = cost.split("}").slice(0, -1).map(c => c.substring(1));
        for (const pip of pips) {
            switch (pip) {
                case "W": this.cost[0]++; break;
                case "U": this.cost[1]++; break;
                case "B": this.cost[2]++; break;
                case "R": this.cost[3]++; break;
                case "G": this.cost[4]++; break;
                case "C": this.cost[5]++; break;
                default:  this.cost[6] += parseInt(pip); break;
            }
        }
    }

    canPlay() {
        return true;
    }
}
