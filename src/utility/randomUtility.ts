/**
 * Generates a random integer between a minimum (inclusive) and a maximum (exclusive) value.
 *
 * @param {number} min - The minimum integer value (inclusive).
 * @param {number} max - The maximum integer value (exclusive).
 * @returns {number} A random integer between min (inclusive) and max (exclusive).
 */
export function randInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}