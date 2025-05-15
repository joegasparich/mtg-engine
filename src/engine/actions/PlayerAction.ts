import Card from "../Card";
import Player from "../Player";
import {ManaAmount, ManaUtility} from "../mana";
import {Battlefield, Hand} from "../Zone";
import {ActivatedAbilityCosts} from "../workers/ActivatedAbilityCosts";
import {PlayerActions} from "./index";
import {game} from "../Game";
import {StepIndex} from "../Step";
import {CombatManager} from "../CombatManager";

export type ActionTarget = Card | Player;

export interface PlayerAction {
    label: () => string;
    targets: ActionTarget[] | null;
    perform: (owner: Player, targets?: ActionTarget[]) => void;
}

class PlayerActionManager {
    private availableActions: PlayerAction[] = [];
    private working = false;

    getAvailableActions(actor: Player, factorInPotentialMana = false, ignoreManaAbilities = false): PlayerAction[] {
        if (this.working) {
            console.error("Tried to get available actions recursively!!!");
            return;
        }

        this.working = true;
        this.availableActions.length = 0;

        const originalMana: Readonly<ManaAmount> = [...actor.manaPool];
        if (factorInPotentialMana)
            ManaUtility.AddMana(actor.manaPool, actor.getPotentialMana());

        for (const card of actor.hand.cards) {
            this.availableActions.push(...this.allCardActions(card, actor, ignoreManaAbilities));
        }

        for (const card of actor.battlefield.cards) {
            this.availableActions.push(...this.allCardActions(card, actor, ignoreManaAbilities));
        }

        if (factorInPotentialMana) {
            actor.manaPool = [...originalMana];
        }

        this.checkForEffects();

        this.working = false;

        return this.availableActions;
    }

    public hasAnyActions(actor: Player, factorInPotentialMana = false, ignoreManaAbilities = false) {
        return this.getAvailableActions(actor, factorInPotentialMana, ignoreManaAbilities).length > 0;
    }

    public getCardActions(card: Card, actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        if (this.working) {
            console.error("Tried to get available actions recursively!!!");
            return;
        }

        this.working = true;
        this.availableActions.length = 0;

        for (const action of this.allCardActions(card, actor, ignoreManaAbilities)) {
            this.availableActions.push(action);
        }

        this.checkForEffects();

        this.working = false;

        return this.availableActions;
    }

    // TODO: This is going to get fucked fast, how to clean up
    private allCardActions(card: Card, actor: Player, ignoreManaAbilities = false): PlayerAction[] {
        const actions: PlayerAction[] = [];

        if (actor != card.controller)
            return actions;

        if (card.zone instanceof Hand) {
            if (ManaUtility.canPay(card.cost, actor.manaPool) && card.canPlay()) {
                actions.push(new PlayerActions.PlayCard(card));
            }
        }

        if (card.zone instanceof Battlefield) {
            for (const abilityDef of card.activatedAbilities) {
                if (ignoreManaAbilities && abilityDef.manaAbility)
                    continue;

                if (card.canActivate(abilityDef) && ActivatedAbilityCosts.get(abilityDef.cost).payable(card, actor)) {
                    actions.push(new PlayerActions.ActivateAbility(abilityDef, card));
                }
            }

            if (game.currentStepIndex == StepIndex.DeclareAttackers && CombatManager.canAttack(card)) {
                actions.push(new PlayerActions.DeclareAttacker(card));
            }

            if (game.currentStepIndex == StepIndex.DeclareBlockers && CombatManager.canBlock(card)) {
                actions.push(new PlayerActions.DeclareBlocker(card));
            }
        }

        return actions;
    }

    checkForEffects() {

    }
}

const playerActionManager = new PlayerActionManager();
export default playerActionManager;

