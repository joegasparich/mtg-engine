import { type ContinuousEffect,ContinuousEffectKind,getRecipients,type Recipients } from "./EffectSystem";
import { change,Layer } from "./Layers";

export function statModifier(power: number, toughness: number) {
    return change(Layer.ModifyPT, () => [power, toughness] as const, (state, p, t) => {
        state.power += p;
        state.toughness += t;
    });
}

export function modifyPowerToughness(recipients: Recipients, power: number, toughness: number): ContinuousEffect {
    const selected = typeof recipients === "function" ? recipients : [...recipients];
    return { kind: ContinuousEffectKind.Layered, effect: {
        select: () => getRecipients(selected), changes: [statModifier(power, toughness)],
    } };
}
