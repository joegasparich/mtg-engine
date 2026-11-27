import type { Targeter } from "@engine/actions";
import type { ZoneChanged } from "@engine/events";
import type { CardObject } from "@engine/GameObject";
import { Exile,type Zone } from "@engine/Zone";

type CardPile = { zone: Zone<CardObject>; label: string; button: HTMLButtonElement };

export class UICardPiles {
    private readonly piles: CardPile[] = [];
    private readonly dialog = document.createElement("dialog");
    private readonly heading = document.createElement("h2");
    private readonly prompt = document.createElement("p");
    private readonly pileChoices = document.createElement("div");
    private readonly empty = document.createElement("p");
    private readonly grid = document.createElement("ul");
    private readonly closeButton = document.createElement("button");
    private pile?: CardPile;
    private targeter?: Targeter;
    private targetPiles: readonly CardPile[] = [];

    constructor(private readonly onTargetingFinished: () => void) {
        this.dialog.className = "spell-target-dialog card-pile-dialog";
        this.heading.id = "card-pile-heading";
        this.dialog.setAttribute("aria-labelledby", this.heading.id);
        this.prompt.className = "card-pile-prompt";
        this.pileChoices.className = "spell-target-choices card-pile-choices";
        this.grid.className = "card-pile-grid";

        this.closeButton.addEventListener("click", () => this.dismiss());
        this.dialog.addEventListener("cancel", event => {
            event.preventDefault();
            this.dismiss();
        });

        const header = document.createElement("header");
        header.append(this.heading, this.closeButton);
        this.dialog.append(header, this.prompt, this.pileChoices, this.empty, this.grid);
        document.body.append(this.dialog);
    }

    addPile(zone: Zone<CardObject>, label: string) {
        const button = document.createElement("button");
        button.className = "card-pile-button";
        button.setAttribute("aria-haspopup", "dialog");
        // 404.2 and 406.3: Any player may examine a graveyard or face-up exiled cards.
        const pile = { zone, label, button };
        button.addEventListener("click", () => this.open(pile));
        this.piles.push(pile);
        this.updateButton(pile);
        return button;
    }

    onCardChangedZone(event: ZoneChanged) {
        for (const pile of this.piles) {
            if (event.oldZone === pile.zone || event.newZone === pile.zone)
                this.updateButton(pile);
        }

        if (this.targeter?.source === event.oldObject)
            this.dismiss();
        else if (this.pile && (event.oldZone === this.pile.zone || event.newZone === this.pile.zone))
            this.renderPile();
    }

    openForTargeting(targeter: Targeter): boolean {
        if (targeter.count !== 1)
            return false;

        const piles = this.piles.filter(pile => pile.zone.objects.some(card => targeter.validateTargets([card])));
        if (!piles.length)
            return false;

        this.targeter = targeter;
        this.targetPiles = piles;
        this.open(piles[0]);
        return true;
    }

    private updateButton({ button, zone, label }: CardPile) {
        const count = zone.objects.length;
        button.textContent = `${zone.name} (${count})`;
        button.setAttribute("aria-label", `${label} (${count})`);
    }

    private open(pile: CardPile) {
        this.showPile(pile);
        this.closeButton.textContent = this.targeter ? "Cancel" : "Close";
        if (!this.dialog.open)
            this.dialog.showModal();
        (this.grid.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? this.closeButton).focus();
    }

    private showPile(pile: CardPile) {
        this.pile = pile;
        this.heading.textContent = pile.label;
        this.empty.textContent = pile.zone instanceof Exile ? "No cards in exile." : "This graveyard is empty.";
        this.prompt.hidden = !this.targeter;
        if (this.targeter)
            this.prompt.textContent = `Choose a target for ${this.targeter.source.name}.`;
        this.pileChoices.replaceChildren();
        if (this.targetPiles.length > 1) {
            for (const choice of this.targetPiles) {
                const button = document.createElement("button");
                button.textContent = choice.label;
                button.setAttribute("aria-pressed", String(choice === pile));
                button.addEventListener("click", () => {
                    this.showPile(choice);
                    this.pileChoices.querySelector<HTMLButtonElement>("[aria-pressed=true]").focus();
                });
                this.pileChoices.append(button);
            }
        }
        this.renderPile();
    }

    private renderPile() {
        const { pile, targeter } = this;
        const cards = pile.zone.objects;
        this.empty.hidden = cards.length > 0;
        this.grid.setAttribute("aria-label", `${pile.label}, newest first`);
        // 404.1: The most recently added card is on top of the graveyard.
        this.grid.replaceChildren(...cards.slice().reverse().map(card => {
            const item = document.createElement("li");
            const image = document.createElement("img");
            image.src = card.def.image_url;
            image.alt = card.name;

            if (!targeter) {
                item.append(image);
                if (pile.zone instanceof Exile)
                    item.append(`Owner: Player ${card.owner.id}`);
                return item;
            }

            const button = document.createElement("button");
            button.disabled = !targeter.validateTargets([card]);
            button.addEventListener("click", () => {
                if (!targeter.validateTargets([card]))
                    return;

                this.close();
                targeter.onTargeted([card]);
                this.onTargetingFinished();
            });
            button.append(image);
            item.append(button);
            return item;
        }));
    }

    private dismiss() {
        const targeter = this.targeter;
        this.close();
        if (targeter) {
            targeter.onCancelled();
            this.onTargetingFinished();
        }
    }

    private close() {
        this.pile = undefined;
        this.targeter = undefined;
        this.targetPiles = [];
        this.dialog.close();
    }
}
