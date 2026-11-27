import { defineComputedProperty } from "@utility/objectUtility";
import { isCardColour } from "~/defs";
import { isBasicLandType,readWord,WordKind } from "~/rulesWords";
import { resolveAbilityGrammar } from "./index";
import type { Ability } from "./Ability";

// CR 612.2: These configuration fields represent subtype words in the card's text.
const subtypeFields = new Set(["landType", "cardSubtype", "excludedSubtype", "baseSubtype"]);

export function bindPartConfig(config: object, ability: Ability, cache: WeakMap<object, object>): object {
    if (cache.has(config)) return cache.get(config);

    // Keep ordinary configuration shared. Copy only a record (or array) with a bound field below it.
    let copy: object;
    const writable = () => copy ??= Array.isArray(config) ? [...config] : { ...config };
    for (const [key, value] of Object.entries(config)) {
        if (key === "manaValueEquals" && typeof value === "string") {
            // Keep an unresolved reference distinct from an omitted filter.
            defineComputedProperty(writable(), key, () => resolveAbilityGrammar(value, ability) ?? value);
            continue;
        }

        if (subtypeFields.has(key) && isBasicLandType(value)) {
            defineComputedProperty(writable(), key, () => readWord(value, WordKind.BasicLandType, ability.wordReplacements));
            continue;
        }

        if (key === "colour" && isCardColour(value)) {
            defineComputedProperty(writable(), key, () => readWord(value, WordKind.Colour, ability.wordReplacements));
            continue;
        }

        // CR 612.3: A granted ability binds its own definition when instantiated.
        if (key === "grant" || !value || typeof value !== "object"
            || !(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype))
            continue;
        const child = bindPartConfig(value, ability, cache);
        if (child !== value) Reflect.set(writable(), key, child);
    }
    const result = copy ?? config;
    cache.set(config, result);
    return result;
}
