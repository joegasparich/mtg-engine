import { PlayerAction } from "@engine/actions/PlayerAction";
import playerActionManager,{ ActionTarget } from "@engine/actions/PlayerActionManager";
import { GameEvent_CastSpell,GameEvent_PlayLand } from "@engine/events";
import { ResolutionChoiceKind,type SpellXChoice } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { CardType } from "~/defs";

export class PlayerAction_PlayCard extends PlayerAction {
    label() {
        return `Play ${this.object.name}`;
    }

    perform(player: Player) {
        if (!player || !this.canPlay(player)) return;

        if (this.object.type === CardType.Land) {
            gameEventManager.addEvent(new GameEvent_PlayLand(player, this.object));
            return;
        }

        if (this.object.variableManaSymbols) {
            this.chooseX(player);
            return;
        }

        this.chooseTargets(player, 0);
    }

    private chooseX(player: Player) {
        const max = playerActionManager.maxAffordableX(this.object, player);
        if (max < 0)
            return;

        // 601.2b–c: Announce X before choosing targets.
        const currentGame = game;
        const choice: SpellXChoice = {
            kind: ResolutionChoiceKind.SpellX,
            player,
            sourceName: this.object.name,
            max,
            submit: (actor, x) => currentGame.submitResolutionChoice(choice, actor,
                () => x === null || (Number.isSafeInteger(x) && x >= 0 && x <= max
                    && playerActionManager.canAutoPayManaCost(this.getCost(x), player)),
                () => {
                    if (x !== null && this.canPlay(player))
                        this.chooseTargets(player, x);
                }),
        };
        currentGame.openResolutionChoice(choice);
    }

    private chooseTargets(player: Player, x: number) {
        const target = this.object.spellTargeter;
        if (target) {
            if (!playerActionManager.canAutoPayManaCost(this.getCost(x), player))
                return;

            // 601.2c, 601.2h
            playerActionManager.startTargeting(this.object, target.validTargets, target.count,
                targets => target.validateTargets(targets), targets => {
                    if (this.canPlay(player))
                        this.castSpell(player, x, targets);
                });
            return;
        }

        this.castSpell(player, x);
    }

    private canPlay(player: Player): boolean {
        return player === this.object.owner && this.object.zone === player.hand && this.object.canPlay();
    }

    private getCost(x: number) {
        return this.object.variableManaSymbols
            ? ManaUtility.withX(this.object.cost, this.object.variableManaSymbols, x)
            : this.object.cost;
    }

    private castSpell(player: Player, x: number, targets: readonly ActionTarget[] = []) {
        if (playerActionManager.payManaCost(this.getCost(x), player))
            gameEventManager.addEvent(new GameEvent_CastSpell(player, this.object, targets, x));
    }
}
