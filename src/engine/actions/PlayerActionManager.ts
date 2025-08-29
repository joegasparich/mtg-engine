import {PlayerAction} from "@engine/actions/PlayerAction";
import Card from "@engine/Card";
import Player from "@engine/Player";
import gameEventManager, {GameEventType} from "@engine/events/GameEventManager";
import {game} from "@engine/Game";
import {ManaAmount, ManaUtility} from "@engine/mana";
import {Battlefield, Hand} from "@engine/Zone";
import {PlayerActions} from "@engine/actions/index";
import {StepIndex} from "@engine/Step";
import {CombatManager} from "@engine/CombatManager";
import {GameEvent_StartTargeting} from "@engine/events/GameEvent_StartTargeting";

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
    targetType: TargetType;
    count: number;
    validateTargets?: (targets: ActionTarget[]) => boolean;
    onTargeted: (targets: ActionTarget[]) => void;
    cancellable: boolean;
    onCancelled?: () => void | null;
}

class PlayerActionManager {
    // TODO: Maybe move to UI file
    public cardActionsForUI = new Map<Card, PlayerAction[]>();

    constructor() {
        // Perf Warning: This might end up being too intensive, might need to cache
        gameEventManager.onPerformed(GameEventType.All, (event) => {
            if (!event.isAction)
                return;

            const player = game.activePlayer();

            if (!player)
                return;

            this.cardActionsForUI = this.getAvailableActions(player, true, false);
        });
    }

    getAvailableActions(actor: Player, factorInPotentialMana = false, ignoreManaAbilities = false): Map<Card, PlayerAction[]> {
        const actions = new Map<Card, PlayerAction[]>();

        const originalMana: Readonly<ManaAmount> = [...actor.manaPool];
        if (factorInPotentialMana)
            ManaUtility.addMana(actor.manaPool, actor.getPotentialMana());

        for (const zone of actor.zones) {
            for (const card of zone.cards) {
                const cardActions = this.getCardActions(card, actor, ignoreManaAbilities);

                if (!cardActions.length)
                    continue;

                actions.set(card, [...cardActions]);
            }
        }

        if (factorInPotentialMana)
            actor.manaPool = [...originalMana];

        return actions;
    }

    public playerHasActions(actor: Player, factorInPotentialMana = false, ignoreManaAbilities = false) {
        return this.getAvailableActions(actor, factorInPotentialMana, ignoreManaAbilities).size > 0;
    }

    public getCardActions(card: Card, actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        const actions = new Map<Card, PlayerAction[]>();
        actions.set(card, this.getCardActionsNoEffects(card, actor, ignoreManaAbilities));

        return actions.get(card);
    }

    private getCardActionsNoEffects(card: Card, actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        const cardActions: PlayerAction[] = [];

        if (actor != card.controller)
            return [];

        if (card.zone instanceof Hand) {
            if (ManaUtility.canPay(card.cost, actor.manaPool) && card.canPlay()) {
                cardActions.push(new PlayerActions.PlayCard(card));
            }
        }

        if (card.zone instanceof Battlefield) {
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

    // public cardHasActions(card: Card, actor: Player, ignoreManaAbilities = false) {
    //     return this.getCardActions(card, actor, ignoreManaAbilities).length > 0;
    // }

    startTargeting(targetTypes: TargetTypeKeys[], count: number,
                   validateTargets: (targets: ActionTarget[]) => boolean,
                   onTargeted: (targets: ActionTarget[]) => void,
                   cancellable= false, onCancelled: () => void | null = null) {
        const targetType = targetTypes.reduce((a, b) => a | TargetTypesMap[b], TargetType.None);

        const targeter: Targeter = {
            targetType,
            count,
            validateTargets,
            onTargeted,
            cancellable,
            onCancelled
        };

        gameEventManager.addEvent(new GameEvent_StartTargeting(targeter));
    }
}

const playerActionManager = new PlayerActionManager();
export default playerActionManager;

