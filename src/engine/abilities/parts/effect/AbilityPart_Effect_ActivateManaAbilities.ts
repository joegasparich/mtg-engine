import { type Ability,type GrammarKey,resolveAbilityGrammar } from "@engine/abilities";
import { getBasicLandMana } from "@engine/abilities/BasicLandMana";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { getObjectsFromSlateInZones } from "@engine/abilities/ZoneSelection";
import type { OneShotEffect } from "@engine/effects/EffectSystem";
import { AbilityActivationTiming,GameEvent_ActivateAbility } from "@engine/events/GameEvent_ActivateAbility";
import { type ManaAbilityChoice,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import { game } from "@engine/Game";
import type { Permanent } from "@engine/GameObject";
import Player from "@engine/Player";
import { Battlefield } from "@engine/Zone";
import { AbilityPart_Effect } from "./AbilityPart_Effect";
import { AbilityPart_Effect_AddMana } from "./AbilityPart_Effect_AddMana";

type ManaActivation = { permanent: Permanent; ability: Ability };

@RegisterAbilityPart
export class AbilityPart_Effect_ActivateManaAbilities extends AbilityPart_Effect {
    player: GrammarKey;
    permanentsFrom: string;
    outSignal?: string;

    perform(effect: OneShotEffect) {
        const player = resolveAbilityGrammar(this.player, this.ability);
        if (!(player instanceof Player))
            return;

        const currentGame = game;
        const remaining = new Set(getObjectsFromSlateInZones(this.ability, this.permanentsFrom, Battlefield));
        const canActivate = ({ permanent, ability }: ManaActivation) => ability.def.isManaAbility
            && permanent.controller === player && permanent.canActivate(ability, player, true);
        const isIntrinsic = ({ permanent, ability }: ManaActivation) => permanent.subtypes.some(subtype => getBasicLandMana(subtype) === ability.def);

        const next = () => {
            // 608.2d and 609.3: Offer legal choices and skip permanents with no activatable mana ability.
            const options = [...remaining].flatMap(permanent => permanent.abilities.map(ability => ({ permanent, ability })))
                .filter(canActivate);
            if (!options.length) {
                if (this.outSignal)
                    this.ability.fireSignal(this.outSignal);
                return;
            }

            const activate = ({ permanent, ability }: ManaActivation) => {
                remaining.delete(permanent);
                effect.performImmediate(new GameEvent_ActivateAbility(player, permanent, ability, [],
                    AbilityActivationTiming.InstructedDuringResolution));
                effect.continueResolution(next);
            };

            // Avoid asking for an order when each land can only use its intrinsic basic-land mana ability.
            const onePerPermanent = new Set(options.map(({ permanent }) => permanent)).size === options.length;
            if (options.length === 1 || (onePerPermanent && options.every(isIntrinsic))) {
                activate(options[0]);
                return;
            }

            const choice: ManaAbilityChoice = {
                kind: ResolutionChoiceKind.ManaAbility,
                player,
                sourceName: this.ability.source.name,
                options: options.map(option => {
                    const { permanent, ability } = option;
                    const mana = isIntrinsic(option) && ability.parts.find(part => part instanceof AbilityPart_Effect_AddMana)?.mana;
                    return `${permanent.name} · ${mana ? `{T}: Add ${mana}` : ability.def.activateString ?? "Activate mana ability"}`;
                }),
                submit: (actor, index) => currentGame.submitResolutionChoice(choice, actor,
                    () => Number.isInteger(index) && !!options[index] && canActivate(options[index]),
                    () => activate(options[index])),
            };
            currentGame.openResolutionChoice(choice);
        };

        effect.continueResolution(next);
    }
}
