import { PlayerActions } from "@engine/actions/index";
import { PlayerAction } from "@engine/actions/PlayerAction";
import type { TargetZone } from "@engine/abilities/parts/AbilityPart_Target";
import { CardObject,GameObject,Permanent,Spell } from "@engine/GameObject";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_ActivateAbility } from "@engine/events";
import { GameEvent_StartTargeting } from "@engine/events/GameEvent_StartTargeting";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import { ManaAmount,ManaCost,ManaUtility } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { Battlefield } from "@engine/Zone";
import { CardType } from "~/defs";

export enum TargetType {
    None = 0,
    Player = 1 << 0,
    Permanent = 1 << 1,
    Spell = 1 << 2,
}
export enum TargetTypeKeys {
    None = "None",
    Player = "Player",
    Permanent = "Permanent",
    Spell = "Spell",
}
export const TargetTypesMap: Record<TargetTypeKeys, TargetType> = {
    [TargetTypeKeys.None]: TargetType.None,
    [TargetTypeKeys.Player]: TargetType.Player,
    [TargetTypeKeys.Permanent]: TargetType.Permanent,
    [TargetTypeKeys.Spell]: TargetType.Spell,
};

export type ActionTarget = GameObject | Player;
export type Targeter = {
    source: CardObject;
    targetType: TargetType;
    zone?: TargetZone;
    count: number;
    validateTargets: (targets: ActionTarget[]) => boolean;
    onTargeted: (targets: ActionTarget[]) => void;
    onCancelled: () => void;
}

export function getTargetTypeKey(target: ActionTarget): TargetTypeKeys {
    // 110.1 and 112.1: A permanent is on the battlefield and a spell is on the stack.
    if (target instanceof Permanent && target.zone instanceof Battlefield)
        return TargetTypeKeys.Permanent;
    if (target instanceof Spell && target.zone === game.stack)
        return TargetTypeKeys.Spell;
    if (target instanceof Player && game.players.includes(target))
        return TargetTypeKeys.Player;
    return TargetTypeKeys.None;
}

class PlayerActionManager {
    // 605.3a: While autopay taps mana sources, this player may activate mana abilities even during resolution.
    private manaPaymentPlayer?: Player;

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

        const otherBattlefields = game.players.filter(player => player !== actor).map(player => player.battlefield);
        for (const zone of [actor.hand, actor.battlefield, ...otherBattlefields]) {
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
        return game.getSpecialActions(actor).length > 0 || this.getAvailableActions(actor, ignoreManaAbilities).size > 0;
    }

    public getCardActions(object: CardObject, actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        const cardActions: PlayerAction[] = [];

        if (!actor || game.hasPendingPlayerInput || actor !== game.activePlayer())
            return [];

        if (object.zone === actor.hand && object.owner === actor) {
            if (object.canPlay() && (object.type === CardType.Land || ManaUtility.canPay(object.cost, actor.manaPool) || this.canAutoPay(object, actor)))
                cardActions.push(new PlayerActions.PlayCard(object));
        }

        if (object instanceof Permanent && object.zone instanceof Battlefield) {
            for (const ability of object.abilities) {
                if (ignoreManaAbilities && ability.def.isManaAbility)
                    continue;

                if (object.canActivate(ability, actor)) {
                    cardActions.push(new PlayerActions.ActivateAbility(object, ability));
                }
            }

            if (object.zone !== actor.battlefield || object.controller !== actor)
                return cardActions;

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
        return this.canAutoPayManaCost(object.cost, actor);
    }

    public canAutoPayManaCost(cost: Readonly<ManaCost>, actor: Player, reservedManaSource?: CardObject) {
        if (game.infiniteMana)
            return true;

        const availableMana: ManaAmount = [...actor.manaPool];
        ManaUtility.addMana(availableMana, actor.getPotentialMana(reservedManaSource));
        return ManaUtility.canPay(cost, availableMana);
    }

    public maxAffordableX(object: CardObject, actor: Player): number {
        const fixed = object.cost.reduce((total, amount) => total + amount, 0);
        const available: ManaAmount = [...actor.manaPool];
        ManaUtility.addMana(available, actor.getPotentialMana());
        if (!game.infiniteMana && !ManaUtility.canPay(object.cost, available))
            return -1;

        const total = game.infiniteMana ? Number.MAX_SAFE_INTEGER : ManaUtility.asGeneric(available);
        return Math.floor((total - fixed) / object.variableManaSymbols);
    }

    public payManaCost(cost: Readonly<ManaCost>, actor: Player,
        payOtherCosts?: () => boolean, reservedManaSource?: CardObject): boolean {
        if (game.infiniteMana)
            return payOtherCosts?.() ?? true;

        if (!ManaUtility.canPay(cost, actor.manaPool)) {
            if (!this.canAutoPayManaCost(cost, actor, reservedManaSource))
                return false;

            const previousPayer = this.manaPaymentPlayer;
            this.manaPaymentPlayer = actor;
            try {
                this.tapManaSources(cost, actor, reservedManaSource);
            } finally {
                this.manaPaymentPlayer = previousPayer;
            }
            if (!ManaUtility.canPay(cost, actor.manaPool))
                return false;
        }

        return (payOtherCosts?.() ?? true) && ManaUtility.pay(cost, actor.manaPool);
    }

    public isPayingManaCost(actor: Player): boolean {
        return this.manaPaymentPlayer === actor;
    }

    public autoPay(object: CardObject, actor: Player) {
        const remaining = this.tapManaSources(object.cost, actor);
        if (remaining.some(v => v > 0))
            throw new Error(`Failed to auto pay for card ${object.def.name}, remaining cost: ${remaining}`);
    }

    private tapManaSources(cost: Readonly<ManaCost>, actor: Player, reservedManaSource?: CardObject) {
        const remaining = [...cost];
        const poolCopy = [...actor.manaPool]; // We don't want to actually pay until we have tapped all our lands etc.
        const sources = reservedManaSource
            ? actor.battlefield.objects.filter(permanent => permanent !== reservedManaSource)
            : actor.battlefield.objects;

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

            for (const permanent of sources) {
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
            for (const permanent of sources) {
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

        return remaining;
    }

    public startTargeting(source: CardObject, targetTypes: readonly TargetTypeKeys[], count: number,
                   validateTargets: (targets: ActionTarget[]) => boolean,
                   onTargeted: (targets: ActionTarget[]) => void, zone?: TargetZone) {
        if (game.hasPendingPlayerInput)
            return;

        const targetType = targetTypes.reduce((a, b) => a | TargetTypesMap[b], TargetType.None);

        const targeter: Targeter = {
            source,
            targetType,
            zone,
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

