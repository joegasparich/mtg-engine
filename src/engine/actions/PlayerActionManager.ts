import { PlayerActions } from "@engine/actions/index";
import { PlayerAction } from "@engine/actions/PlayerAction";
import Card from "@engine/Card";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_ActivateAbility } from "@engine/events";
import { GameEvent_StartTargeting } from "@engine/events/GameEvent_StartTargeting";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaAmount,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { CardType } from "~/defs";

export enum TargetType {
    None = 0,
    Player = 1 << 0,
    Card = 1 << 1,
}
export enum TargetTypeKeys {
    None = "None",
    Player = "Player",
    Card = "Card"
}
export const TargetTypesMap: Record<TargetTypeKeys, TargetType> = {
    None: TargetType.None,
    Player: TargetType.Player,
    Card: TargetType.Card
};

export type ActionTarget = Card | Player;
export type Targeter = {
    source: Card;
    targetType: TargetType;
    count: number;
    validateTargets: (targets: ActionTarget[]) => boolean;
    onTargeted: (targets: ActionTarget[]) => void;
    onCancelled: () => void;
}

class PlayerActionManager {
    // TODO: Maybe move to UI file
    public cardActionsForUI = new Map<Card, PlayerAction[]>();

    constructor() {
        // Perf Warning: This might end up being too intensive, might need to cache
        gameEventManager.onPerformed(GameEventType.All, (event) => {
            if (event.isAction)
                this.refreshCardActionsForUI();
        });
    }

    private refreshCardActionsForUI() {
        const player = game.activePlayer();
        this.cardActionsForUI = player && !game.pendingTargeter
            ? this.getAvailableActions(player)
            : new Map();
    }

    getAvailableActions(actor: Player, ignoreManaAbilities = false): Map<Card, PlayerAction[]> {
        const actions = new Map<Card, PlayerAction[]>();

        for (const zone of [actor.hand, actor.battlefield]) {
            for (const card of zone.cards) {
                const cardActions = this.getCardActions(card, actor, ignoreManaAbilities);

                if (!cardActions.length)
                    continue;

                actions.set(card, cardActions);
            }
        }

        return actions;
    }

    public playerHasActions(actor: Player, ignoreManaAbilities = false) {
        return this.getAvailableActions(actor, ignoreManaAbilities).size > 0;
    }

    public getCardActions(card: Card, actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        const cardActions: PlayerAction[] = [];

        if (!actor || game.pendingTargeter || actor !== game.activePlayer() || actor !== card.controller)
            return [];

        if (card.zone === actor.hand) {
            if (card.canPlay() && (card.type === CardType.Land || ManaUtility.canPay(card.cost, actor.manaPool) || this.canAutoPay(card, actor)))
                cardActions.push(new PlayerActions.PlayCard(card));
        }

        if (card.zone === actor.battlefield) {
            for (const ability of card.abilities) {
                if (ignoreManaAbilities && ability.def.isManaAbility)
                    continue;

                if (card.canActivate(ability)) {
                    cardActions.push(new PlayerActions.ActivateAbility(card, ability));
                }
            }

            if (game.currentStepIndex == StepIndex.DeclareAttackers && CombatManager.canAttack(card)) {
                cardActions.push(new PlayerActions.DeclareAttacker(card));
            }

            if (game.currentStepIndex == StepIndex.DeclareBlockers && CombatManager.canBlockAnyAttackers(card)) {
                cardActions.push(new PlayerActions.DeclareBlocker(card));
            }
        }

        return cardActions;
    }

    public canAutoPay(card: Card, actor: Player) {
        const availableMana: ManaAmount = [...actor.manaPool];
        ManaUtility.addMana(availableMana, actor.getPotentialMana());
        return ManaUtility.canPay(card.cost, availableMana);
    }

    public autoPay(card: Card, actor: Player) {
        const remaining = [...card.cost];
        const poolCopy = [...actor.manaPool]; // We don't want to actually pay until we have tapped all our lands etc.

        // First pay specific colours directly from what we have in the pool
        for (let i = 0; i < 6; i++) {
            const diff = Math.min(remaining[i], poolCopy[i]);
            remaining[i] -= diff;
            poolCopy[i] -= diff;
        }

        // Then, pay generic from what we have in the pool
        for (let i = 0; i < 6; i++) {
            if (remaining[6] == 0)
                break;

            const diff = Math.min(remaining[6], poolCopy[i]);
            remaining[6] -= diff;
            poolCopy[i] -= diff;
        }

        // Then, look for cards with mana abilities matching the specific colours
        for (let i = 0; i < 6; i++) {
            if (remaining[i] == 0)
                continue;

            for (const card of actor.battlefield.cards) {
                for (const ability of card.abilities) {
                    if (!ability.def.isManaAbility)
                        continue;

                    // TODO: Currently doesn't handle mana abilities that cost, e.g. filtering
                    if (!ability.isFreeTap || !ability.canActivate())
                        continue;

                    const potentialMana = ability.getPotentialMana();
                    if (potentialMana[i] == 0)
                        continue;

                    if (!gameEventManager.performImmediate(new GameEvent_ActivateAbility(actor, card, ability)))
                        continue;

                    const diff = Math.min(remaining[i], potentialMana[i]);
                    remaining[i] -= diff;

                    if (remaining[i] == 0)
                        break;
                }
                if (remaining[i] == 0)
                    break;
            }
        }

        // Finally, look for cards with mana abilities to pay the generic
        if (remaining[6] > 0) {
            for (const card of actor.battlefield.cards) {
                for (const ability of card.abilities) {
                    if (!ability.def.isManaAbility)
                        continue;

                    // TODO: Currently doesn't handle mana abilities that cost, e.g. filtering
                    if (!ability.isFreeTap || !ability.canActivate())
                        continue;

                    const potentialMana = ability.getPotentialMana();
                    const generic = ManaUtility.asGeneric(potentialMana);

                    if (!gameEventManager.performImmediate(new GameEvent_ActivateAbility(actor, card, ability)))
                        continue;

                    const diff = Math.min(remaining[6], generic);
                    remaining[6] -= diff;

                    if (remaining[6] == 0)
                        break;
                }
                if (remaining[6] == 0)
                    break;
            }
        }

        if (remaining.some(v => v > 0))
            throw new Error(`Failed to auto pay for card ${card.def.name}, remaining cost: ${remaining}`);
    }

    public startTargeting(source: Card, targetTypes: TargetTypeKeys[], count: number,
                   validateTargets: (targets: ActionTarget[]) => boolean,
                   onTargeted: (targets: ActionTarget[]) => void) {
        if (game.pendingTargeter)
            return;

        const targetType = targetTypes.reduce((a, b) => a | TargetTypesMap[b], TargetType.None);

        const targeter: Targeter = {
            source,
            targetType,
            count,
            validateTargets,
            onTargeted: targets => {
                if (game.pendingTargeter !== targeter || !validateTargets(targets))
                    return;

                game.pendingTargeter = null;
                this.refreshCardActionsForUI();
                onTargeted(targets);
            },
            onCancelled: () => {
                if (game.pendingTargeter !== targeter)
                    return;

                game.pendingTargeter = null;
                this.refreshCardActionsForUI();
            },
        };

        game.pendingTargeter = targeter;
        gameEventManager.addEvent(new GameEvent_StartTargeting(targeter));
    }
}

const playerActionManager = new PlayerActionManager();
export default playerActionManager;

