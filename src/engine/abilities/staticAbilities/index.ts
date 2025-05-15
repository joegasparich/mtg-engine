import Card from "../../Card";
import { StaticAbility } from "./StaticAbility";
import {StaticAbility_Flying} from "./StaticAbility_Flying";

export * from "./StaticAbility_Flying";
export {StaticAbility} from "./StaticAbility";

type StaticAbilityConstructor = new (card: Card) => StaticAbility;
export const StaticAbilities: Record<string, StaticAbilityConstructor> = {
    StaticAbility_Flying: StaticAbility_Flying
};
