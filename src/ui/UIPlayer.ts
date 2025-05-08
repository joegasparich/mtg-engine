import * as PIXI from "pixi.js";

import Player from "../engine/Player";
import {UIHand} from "./UIHand";
import {UIBattlefield} from "./UIBattlefield";
import {pixi} from "./UIRoot";

export class UIPlayer extends PIXI.Container {
    player: Player

    hand: UIHand;
    battlefield: UIBattlefield;

    constructor(player: Player, position: PIXI.Point, rotation: number) {
        super();

        this.player = player;
        this.position = position;
        this.angle = rotation;

        this.hand = new UIHand(player.hand);
        this.battlefield = new UIBattlefield(player.battlefield);

        this.addChild(this.battlefield);
        this.addChild(this.hand);
        this.hand.position = new PIXI.Point(0, pixi.screen.height/2 - 30);
    }
}