import DOMElement,{ DOMPosition } from "./DOMElement";

export default class DOMButton extends DOMElement {
    set onClick(value: () => void) {
        this.element.removeEventListener('click', this._onClick);
        this._onClick = value;
        this.element.addEventListener('click', this._onClick);
    }
    private _onClick: () => void;

    get text(): string { return this.element.textContent; }
    set text(val: string) { this.element.textContent = val; }

    constructor(
        text: string,
        position: DOMPosition,
        onClick: () => void
    ) {
        super(document.createElement('button'), position);

        this.text = text;

        this._onClick = onClick;
        this.element.addEventListener('click', this._onClick);
    }

    override destroy() {
        this.element.removeEventListener('click', this._onClick);

        super.destroy();
    }
}