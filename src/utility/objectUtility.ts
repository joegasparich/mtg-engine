export function defineComputedProperty(target: object, key: PropertyKey, get: () => unknown): () => void {
    Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        get,
    });

    return () => { Reflect.deleteProperty(target, key); };
}
