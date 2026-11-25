import { PlayerActions } from "@engine/actions/index";
import { PlayerAction } from "@engine/actions/PlayerAction";
import { CardObject,GameObject,Permanent } from "@engine/GameObject";
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

export type ActionTarget = GameObject | Player;
export type Targeter = {
    source: CardObject;
    targetType: TargetType;
    count: number;
    validateTargets: (targets: ActionTarget[]) => boolean;
    onTargeted: (targets: ActionTarget[]) => void;
    onCancelled: () => void;
}

class PlayerActionManager {
    // TODO: Maybe move to UI file
    public cardActionsForUI = new Map<CardObject, PlayerAction[]>();

    constructor() {
        // Perf Warning: This might end up being too intensive, might need to cache
        gameEventManager.onPerformed(GameEventType.All, (event) => {
            if (game?.pendingTargeter?.source.retired)
                game.pendingTargeter.onCancelled();
            else if (event.isAction)
                this.refreshCardActionsForUI();
        });
    }

    public refreshCardActionsForUI() {
        const player = game.activePlayer();
        this.cardActionsForUI = player && !game.hasPendingPlayerInput
            ? this.getAvailableActions(player)
            : new Map();
    }

    getAvailableActions(actor: Player, ignoreManaAbilities = false): Map<CardObject, PlayerAction[]> {
        const actions = new Map<CardObject, PlayerAction[]>();

        for (const zone of [actor.hand, actor.battlefield]) {
            for (const object of zone.objects) {
                const cardActions = this.getCardActions(object, actor, ignoreManaAbilities);

                if (!cardActions.length)
                    continue;

                actions.set(object, cardActions);
            }
        }

        return actions;
    }

    public playerHasActions(actor: Player, ignoreManaAbilities = false) {
        return this.getAvailableActions(actor, ignoreManaAbilities).size > 0;
    }

    public getCardActions(object: CardObject, actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        const cardActions: PlayerAction[] = [];

        if (!actor || game.hasPendingPlayerInput || actor !== game.activePlayer())
            return [];

        if (object.zone === actor.hand && object.owner === actor) {
            if (object.canPlay() && (object.type === CardType.Land || ManaUtility.canPay(object.cost, actor.manaPool) || this.canAutoPay(object, actor)))
                cardActions.push(new PlayerActions.PlayCard(object));
        }

        if (object instanceof Permanent && object.zone === actor.battlefield && object.controller === actor) {
            for (const ability of object.abilities) {
                if (ignoreManaAbilities && ability.def.isManaAbility)
                    continue;

                if (object.canActivate(ability)) {
                    cardActions.push(new PlayerActions.ActivateAbility(object, ability));
                }
            }

            if (actor === game.declarationPlayer && game.currentStepIndex === StepIndex.DeclareAttackers
                && CombatManager.defendingPlayer && CombatManager.canAttack(object)) {
                cardActions.push(new PlayerActions.DeclareAttacker(object));
            }

            if (actor === game.declarationPlayer && game.currentStepIndex === StepIndex.DeclareBlockers && CombatManager.canBlockAnyAttackers(object)) {
                cardActions.push(new PlayerActions.DeclareBlocker(object));
            }
        }

        return cardActions;
    }

    public canAutoPay(object: CardObject, actor: Player) {
        if (game.infiniteMana)
            return true;

        const availableMana: ManaAmount = [...actor.manaPool];
        ManaUtility.addMana(availableMana, actor.getPotentialMana());
        return ManaUtility.canPay(object.cost, availableMana);
    }

    public autoPay(object: CardObject, actor: Player) {
        const remaining = [...object.cost];
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

            for (const permanent of actor.battlefield.objects) {
                for (const ability of permanent.abilities) {
                    if (!ability.def.isManaAbility)
                        continue;

                    // TODO: Currently doesn't handle mana abilities that cost, e.g. filtering
                    if (!ability.isFreeTap || !ability.canActivate())
                        continue;

                    const potentialMana = ability.getPotentialMana();
                    if (potentialMana[i] == 0)
                        continue;

                    if (!gameEventManager.performImmediate(new GameEvent_ActivateAbility(actor, permanent, ability)))
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
            for (const permanent of actor.battlefield.objects) {
                for (const ability of permanent.abilities) {
                    if (!ability.def.isManaAbility)
                        continue;

                    // TODO: Currently doesn't handle mana abilities that cost, e.g. filtering
                    if (!ability.isFreeTap || !ability.canActivate())
                        continue;

                    const potentialMana = ability.getPotentialMana();
                    const generic = ManaUtility.asGeneric(potentialMana);

                    if (!gameEventManager.performImmediate(new GameEvent_ActivateAbility(actor, permanent, ability)))
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
            throw new Error(`Failed to auto pay for card ${object.def.name}, remaining cost: ${remaining}`);
    }

    public startTargeting(source: CardObject, targetTypes: TargetTypeKeys[], count: number,
                   validateTargets: (targets: ActionTarget[]) => boolean,
                   onTargeted: (targets: ActionTarget[]) => void) {
        if (game.hasPendingPlayerInput)
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

