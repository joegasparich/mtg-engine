export type DOMPosition = { top?: string; left?: string; right?: string; bottom?: string };

export default abstract class DOMElement {
    element: HTMLElement;

    protected constructor(element: HTMLElement, position: DOMPosition) {
        this.element = element;
        this.setPosition(position);
        document.body.appendChild(element);
    }

    public setPosition({ top, left, right, bottom }: { top?: string; left?: string; right?: string; bottom?: string }): void {
        this.element.style.position = 'absolute';
        if (top !== undefined) this.element.style.top = top;
        if (left !== undefined) this.element.style.left = left;
        if (right !== undefined) this.element.style.right = right;
        if (bottom !== undefined) this.element.style.bottom = bottom;
    }

    public destroy(): void {
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}