import { PlayerAction } from "@engine/actions/PlayerAction";
import playerActionManager,{ ActionTarget } from "@engine/actions/PlayerActionManager";
import { GameEvent_CastSpell,GameEvent_PlayLand } from "@engine/events";
import { ResolutionChoiceKind,type SpellModeChoice,type SpellXChoice } from "@engine/events/GameEvent_ResolutionChoice";
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

        if (this.object.hasType(CardType.Land)) {
            gameEventManager.addEvent(new GameEvent_PlayLand(player, this.object));
            return;
        }

        if (this.object.def.spellModes)
            this.chooseMode(player);
        else
            this.chooseXOrTargets(player);
    }

    private chooseMode(player: Player) {
        const canPay = () => playerActionManager.canAutoPayManaCost(this.getCost(0), player);
        if (!canPay())
            return;

        // 601.2b–c: Announce the mode before X and any targets.
        const currentGame = game;
        const choice: SpellModeChoice = {
            kind: ResolutionChoiceKind.SpellMode,
            player,
            sourceName: this.object.name,
            options: this.object.def.spellModes.map(({ text }, mode) => ({
                text, enabled: this.object.canChooseSpellMode(mode),
            })),
            submit: (actor, mode) => currentGame.submitResolutionChoice(choice, actor,
                () => mode === null || (choice.options[mode]?.enabled && this.object.canChooseSpellMode(mode) && canPay()),
                () => {
                    if (mode !== null && this.canPlay(player, mode))
                        this.chooseXOrTargets(player, mode);
                }),
        };
        currentGame.openResolutionChoice(choice);
    }

    private chooseXOrTargets(player: Player, mode?: number) {
        if (this.object.variableManaSymbols)
            this.chooseX(player, mode);
        else
            this.chooseTargets(player, 0, mode);
    }

    private chooseX(player: Player, mode?: number) {
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
                    && playerActionManager.canAutoPayManaCost(this.getCost(x), player)
                    && this.object.withCastingX(x, () => this.object.getSpellTargeter(mode)?.hasLegalTargets() ?? true)),
                () => {
                    if (x !== null && this.canPlay(player, mode))
                        this.chooseTargets(player, x, mode);
                }),
        };
        currentGame.openResolutionChoice(choice);
    }

    private chooseTargets(player: Player, x: number, mode?: number) {
        const target = this.object.getSpellTargeter(mode);
        if (target) {
            if (!playerActionManager.canAutoPayManaCost(this.getCost(x), player))
                return;

            // 601.2c, 601.2h
            playerActionManager.startTargeting(this.object, target.targetTypes, target.count,
                targets => this.object.withCastingX(x, () => target.validateTargets(targets)), targets => {
                    if (this.canPlay(player, mode))
                        this.castSpell(player, x, targets, mode);
                }, target.zone);
            return;
        }

        this.castSpell(player, x, [], mode);
    }

    private canPlay(player: Player, mode?: number): boolean {
        return player === this.object.owner && this.object.zone === player.hand && this.object.canPlay()
            && (mode === undefined || this.object.canChooseSpellMode(mode));
    }

    private getCost(x: number) {
        return this.object.variableManaSymbols
            ? ManaUtility.withX(this.object.cost, this.object.variableManaSymbols, x)
            : this.object.cost;
    }

    private castSpell(player: Player, x: number, targets: readonly ActionTarget[], mode?: number) {
        if (playerActionManager.payManaCost(this.getCost(x), player))
            gameEventManager.addEvent(new GameEvent_CastSpell(player, this.object, targets, x, mode));
    }
}
