import { RegisterAbilityPart } from "@engine/abilities/registry";
import { matchesTargetValidator } from "@engine/abilities/TargetValidator";
import { GameEvent_DiscardCard,GameEvent_SacrificePermanent } from "@engine/events/GameEvent_ChangeCardZone";
import type { PublicCardSelection } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager,{ type GameEvent } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { type CardObject,Permanent } from "@engine/GameObject";
import type { CardType } from "~/defs";
import { AbilityPart_Effect } from "./AbilityPart_Effect";

type EqualizePhase = { action: "sacrifice"; cardType: CardType } | { action: "discard" };

@RegisterAbilityPart
export class AbilityPart_Effect_EqualizeCards extends AbilityPart_Effect {
    phases: readonly EqualizePhase[] = [];

    perform() {
        if (this.phases.length)
            this.equalizePhase(0);
    }

    private equalizePhase(phaseIndex: number) {
        const phase = this.phases[phaseIndex];
        const active = game.currentTurnPlayerID;
        // 101.4: Turn order starts with the player whose turn it is.
        const players = [...game.players.slice(active), ...game.players.slice(0, active)];
        const permanents = phase.action === "sacrifice"
            ? players.flatMap(player => player.battlefield.objects.filter(card => matchesTargetValidator(card, phase)))
            : [];
        // 608.2c–d: Read the game state when this instruction begins.
        const options = players.map(player => phase.action === "sacrifice"
            ? permanents.filter(card => card.controller === player)
            : [...player.hand.objects]);
        const minimum = Math.min(...options.map(cards => cards.length));
        const earlierChoices: PublicCardSelection[] = [];
        const events: GameEvent[] = [];

        const chooseFor = (index: number) => {
            if (index === players.length) {
                // 101.4 and 608.2f: Make all choices before moving any of the cards.
                if (events.length)
                    gameEventManager.performSimultaneous(events);
                if (phaseIndex + 1 < this.phases.length)
                    gameEventManager.continueResolution(() => this.equalizePhase(phaseIndex + 1));
                return;
            }

            const player = players[index];
            const cards = options[index];
            const sacrifice = phase.action === "sacrifice";
            const count = sacrifice ? minimum : cards.length - minimum;
            const accept = (selection: readonly CardObject[]) => {
                if (sacrifice) {
                    earlierChoices.push({ player, cards: selection });
                    const kept = new Set(selection);
                    for (const card of cards) {
                        if (!kept.has(card) && card instanceof Permanent)
                            events.push(new GameEvent_SacrificePermanent(player, card));
                    }
                } else {
                    events.push(...selection.map(card => new GameEvent_DiscardCard(player, card)));
                }
                chooseFor(index + 1);
            };

            if (!count || count === cards.length) {
                accept(count ? cards : []);
                return;
            }

            const details = { player, sourceName: this.ability.source.name, options: cards, count };
            if (phase.action === "sacrifice") {
                const type = phase.cardType.toLowerCase();
                game.requestResolutionChoice({
                    ...details, prompt: `Keep ${count} ${type}${count === 1 ? "" : "s"}`,
                    visibility: "public", earlierChoices: [...earlierChoices],
                }, accept);
            } else {
                // 101.4a: Earlier discard choices stay hidden until the batch moves.
                game.requestResolutionChoice({
                    ...details, prompt: `Discard ${count} card${count === 1 ? "" : "s"}`, visibility: "private",
                }, accept);
            }
        };

        chooseFor(0);
    }
}
