import DOMElement, {DOMPosition} from "./DOMElement";

export default class DOMLabel extends DOMElement {
    get text(): string { return this.element.textContent; }
    set text(val: string) { this.element.textContent = val; }

    constructor(
        text: string,
        position: DOMPosition
    ) {
        super(document.createElement('span'), position);

        this.text = text;
    }
}