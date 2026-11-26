import type { Ability } from "@engine/abilities/Ability";
import { RegisterAbilityPart } from "@engine/abilities/registry";
import { ContinuousEffectKind } from "@engine/effects/EffectSystem";
import { GameEvent_CheckCharacteristics } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager from "@engine/events/GameEventManager";
import { game } from "@engine/Game";
import type { GameObject } from "@engine/GameObject";
import { Battlefield } from "@engine/Zone";
import { BasicLandType,CardType } from "~/defs";
import { AbilityPart } from "./AbilityPart";

// 205.3i: A permanent can also have subtypes belonging to its other card types.
const landTypes = new Set<string>([...Object.values(BasicLandType), "Cave", "Desert", "Gate", "Lair", "Locus",
    "Mine", "Planet", "Power-Plant", "Sphere", "Tower", "Town", "Urza’s", "Urza's"]);

@RegisterAbilityPart
export class AbilityPart_GiveBasicLandType extends AbilityPart {
    landsFrom: string;
    landType: BasicLandType;
    private revoke?: () => void;

    setup(ability: Ability) {
        super.setup(ability);
        const { source, slate } = ability;
        if (this.revoke || !(source.zone instanceof Battlefield))
            return;

        this.revoke = gameEventManager.effects.startContinuous(ability, {
            kind: ContinuousEffectKind.EventCheck,
            check: ({ events }) => {
                for (const event of events) {
                    if (!(event instanceof GameEvent_CheckCharacteristics) || !event.characteristics.types.includes(CardType.Land))
                        continue;

                    // 611.3a, 613.1d: Check membership at the time the land type is read.
                    const lands: readonly GameObject[] | undefined = slate[this.landsFrom];
                    if (lands?.includes(event.object)) {
                        // 305.7: Replace the land types and native abilities; external grants still apply.
                        event.characteristics.subtypes = [...event.characteristics.subtypes.filter(type => !landTypes.has(type)), this.landType];
                        event.characteristics.nativeAbilities = [];
                    }
                }
            },
        });
        // The selector's setup has made the live slate selection available.
        this.refreshLandAbilities();
    }

    cleanup() {
        if (!this.revoke)
            return;

        this.revoke();
        this.revoke = undefined;
        this.refreshLandAbilities();
    }

    private refreshLandAbilities() {
        // The live selection can already be gone during cleanup. Reconcile remaining lands directly.
        for (const player of game.players) {
            for (const land of player.battlefield.objects) {
                if (land.hasType(CardType.Land))
                    land.refreshBaseAbilities();
            }
        }
    }
}
