import DOMElement, {DOMPosition} from "./DOMElement";

export default class DOMButton extends DOMElement {
    onClick: () => any;

    get text(): string { return this.element.textContent; }
    set text(val: string) { this.element.textContent = val; }

    constructor(
        text: string,
        position: DOMPosition,
        onClick: () => any
    ) {
        super(document.createElement('button'), position);

        this.text = text;

        this.onClick = onClick;
        this.element.addEventListener('click', this.onClick);
    }

    override destroy() {
        this.element.removeEventListener('click', this.onClick);

        super.destroy();
    }
}