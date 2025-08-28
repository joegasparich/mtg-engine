import DOMElement, {DOMPosition} from "./DOMElement";

export default class DOMButton extends DOMElement {
    set onClick(value: () => any) {
        this._onClick = value;
        this.element.removeEventListener('click', this._onClick);
        this.element.addEventListener('click', this._onClick);
    }
    private _onClick: () => any;

    get text(): string { return this.element.textContent; }
    set text(val: string) { this.element.textContent = val; }

    constructor(
        text: string,
        position: DOMPosition,
        onClick: () => any
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