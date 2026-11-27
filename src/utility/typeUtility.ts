export function autobind<F extends (...args: never[]) => unknown>(
    _target: object,
    name: string,
    descriptor: TypedPropertyDescriptor<F>,
): TypedPropertyDescriptor<F> {
    const { enumerable, configurable, value } = descriptor;

    const boundMethod = Symbol(name);

    return {
        enumerable,
        configurable,

        get(this: { [boundMethod]?: F }) {
            return this[boundMethod] || (this[boundMethod] = value!.bind(this));
        },

        set(value: F) {
            Object.defineProperty(this, name, {
                writable: true,
                enumerable: true,
                configurable: true,
                value,
            });
        },
    };
}