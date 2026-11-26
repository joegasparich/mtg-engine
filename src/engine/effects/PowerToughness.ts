import { GameEvent_CheckPowerToughness } from "@engine/events/GameEvent_CardInteractionChecks";
import { type ContinuousEffect,ContinuousEffectKind,getRecipients,type Recipients } from "./EffectSystem";

export function modifyPowerToughness(recipients: Recipients, power: number, toughness: number): ContinuousEffect {
    const selected = typeof recipients === "function" ? recipients : [...recipients];
    return {
        kind: ContinuousEffectKind.EventCheck,
        check: ({ events }) => {
            for (const event of events) {
                if (event instanceof GameEvent_CheckPowerToughness && getRecipients(selected).includes(event.permanent)) {
                    event.power += power;
                    event.toughness += toughness;
                }
            }
        },
    };
}
