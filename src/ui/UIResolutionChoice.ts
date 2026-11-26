import { DamageAllocationAction } from "@engine/effects/DamagePrevention";
import { CardChoicePresentation,CardChoiceVisibility,type DamagePreventionAllocationChoice,ManaPaymentDecision,OptionalDecision,type ResolutionChoice,ResolutionChoiceKind,type SpellXChoice } from "@engine/events/GameEvent_ResolutionChoice";
import { type CardObject,Permanent } from "@engine/GameObject";
import { UICardSelection } from "@ui/UICardSelection";
import type UIRoot from "@ui/UIRoot";
import { type CardColour,cardColours } from "~/defs";

const colourNames: Record<CardColour, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

export class UIResolutionChoice {
    private readonly panel = document.createElement("section");
    private readonly status = document.createElement("p");
    private readonly confirm = document.createElement("button");
    private readonly selection?: UICardSelection;
    private readonly optionsList?: HTMLUListElement;
    private firstInput?: HTMLInputElement;
    private handoff?: HTMLDialogElement;

    get player() { return this.choice.player; }

    constructor(private readonly root: UIRoot, private readonly choice: ResolutionChoice) {
        const heading = document.createElement("h2");
        heading.id = "resolution-choice-heading";
        heading.textContent = `${choice.sourceName} · Player ${choice.player.id}`;
        this.panel.className = "card-selection-panel resolution-choice-panel";
        this.panel.setAttribute("aria-labelledby", heading.id);
        this.panel.append(heading);

        if (choice.kind === ResolutionChoiceKind.ManaPayment) {
            const decline = document.createElement("button");
            this.confirm.textContent = `Pay ${choice.cost}`;
            decline.textContent = "Decline";
            this.confirm.addEventListener("click", () => choice.submit(choice.player, ManaPaymentDecision.Pay));
            decline.addEventListener("click", () => choice.submit(choice.player, ManaPaymentDecision.Decline));
            this.panel.append(this.confirm, decline);
            return;
        }
        if (choice.kind === ResolutionChoiceKind.Optional) {
            const prompt = document.createElement("p");
            const accept = document.createElement("button");
            prompt.textContent = choice.prompt;
            this.confirm.textContent = choice.declineLabel;
            accept.textContent = choice.acceptLabel;
            this.confirm.addEventListener("click", () => choice.submit(choice.player, OptionalDecision.Decline));
            accept.addEventListener("click", () => choice.submit(choice.player, OptionalDecision.Accept));
            this.panel.append(prompt, this.confirm, accept);
            return;
        }
        if (choice.kind === ResolutionChoiceKind.SpellX) {
            this.addSpellXForm(choice);
            return;
        }
        if (choice.kind === ResolutionChoiceKind.SpellMode) {
            const prompt = document.createElement("p");
            prompt.textContent = "Choose one mode.";
            const list = this.optionsList = document.createElement("ul");
            list.className = "resolution-card-options";
            choice.options.forEach(({ text, enabled }, mode) => {
                const item = document.createElement("li");
                const option = document.createElement("button");
                option.textContent = text;
                option.disabled = !enabled;
                option.addEventListener("click", () => choice.submit(choice.player, mode));
                item.append(option);
                list.append(item);
            });
            const cancel = document.createElement("button");
            cancel.textContent = "Cancel";
            cancel.addEventListener("click", () => choice.submit(choice.player, null));
            this.panel.addEventListener("keydown", event => {
                if (event.key === "Escape")
                    choice.submit(choice.player, null);
            });
            this.panel.append(prompt, list, cancel);
            return;
        }
        if (choice.kind === ResolutionChoiceKind.Colour || choice.kind === ResolutionChoiceKind.DamagePreventionOrder) {
            const prompt = document.createElement("p");
            prompt.textContent = choice.kind === ResolutionChoiceKind.Colour ? "Choose a colour." : "Choose a damage effect to apply next.";
            const list = this.optionsList = document.createElement("ul");
            list.className = "resolution-card-options";
            const options = choice.kind === ResolutionChoiceKind.Colour
                ? cardColours.map(colour => ({ label: colourNames[colour], select: () => choice.submit(choice.player, colour) }))
                : choice.options.map((label, index) => ({ label, select: () => choice.submit(choice.player, index) }));
            for (const { label, select } of options) {
                const item = document.createElement("li");
                const option = document.createElement("button");
                option.textContent = label;
                option.addEventListener("click", select);
                item.append(option);
                list.append(item);
            }
            this.panel.append(prompt, list);
            return;
        }
        if (choice.kind === ResolutionChoiceKind.DamagePreventionAllocation) {
            this.addDamageAllocationForm(choice);
            return;
        }

        const prompt = document.createElement("p");
        prompt.textContent = choice.prompt;
        this.panel.append(prompt);

        if (choice.presentation === CardChoicePresentation.SingleCardList) {
            const select = (card: CardObject) => choice.submit(choice.player, [card]);
            this.selection = new UICardSelection((card, selected) => {
                if (selected)
                    select(card);
                this.selection.setCards(choice.options);
            }, choice.count);
            this.selection.setCards(choice.options);
            const list = this.optionsList = document.createElement("ul");
            list.className = "resolution-card-options";
            for (const card of choice.options) {
                const item = document.createElement("li");
                const option = document.createElement("button");
                const player = card.controller ?? card.owner;
                const location = card.zone?.name.toLowerCase() ?? "left its zone";
                const tapped = card instanceof Permanent && card.tapped && !card.retired ? ", tapped" : "";
                option.textContent = `${card.name} · Player ${player.id}, ${location}${tapped}`;
                option.addEventListener("click", () => select(card));
                item.append(option);
                list.append(item);
            }
            this.panel.append(list);
            return;
        }

        this.selection = new UICardSelection(() => this.update(), choice.count);
        this.selection.setCards(choice.options);
        this.status.setAttribute("role", "status");
        this.panel.append(this.status);

        if (choice.visibility === CardChoiceVisibility.Public && choice.earlierChoices.length) {
            const list = document.createElement("ul");
            list.className = "earlier-public-choices";
            for (const { player, cards } of choice.earlierChoices) {
                const item = document.createElement("li");
                const names = cards.map(card => card instanceof Permanent && card.tapped ? `${card.name} (tapped)` : card.name);
                item.textContent = `Player ${player.id} keeps ${names.join(", ") || "none"}`;
                list.append(item);
            }
            this.panel.append(list);
        }

        this.confirm.textContent = "Confirm selection";
        this.confirm.addEventListener("click", () => choice.submit(choice.player, this.selection.selection));
        this.panel.append(this.confirm);
        this.update();
    }

    get cardSelection() {
        if (!this.handoff)
            return this.selection;
    }

    private addSpellXForm(choice: SpellXChoice) {
        const form = document.createElement("form");
        form.className = "numeric-choice-form";
        const input = this.addNumberInput(form, "Value of X", choice.max);
        this.confirm.textContent = "Continue";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => choice.submit(choice.player, null));
        form.addEventListener("keydown", event => {
            if (event.key === "Escape")
                choice.submit(choice.player, null);
        });
        form.addEventListener("submit", event => {
            event.preventDefault();
            choice.submit(choice.player, input.valueAsNumber);
        });
        form.append(cancel, this.confirm);
        this.panel.append(form);
    }

    private addDamageAllocationForm(choice: DamagePreventionAllocationChoice) {
        const form = document.createElement("form");
        form.className = "numeric-choice-form";
        const prompt = document.createElement("p");
        const recipient = choice.hits[0].recipientName;
        const redirecting = choice.action === DamageAllocationAction.Redirect;
        prompt.textContent = redirecting
            ? `Redirect ${choice.total} damage from ${recipient}.`
            : `Prevent ${choice.total} damage to ${recipient}.`;
        form.append(prompt);
        const inputs = choice.hits.map(hit => this.addNumberInput(form, `${hit.source.name} · ${hit.amount} damage`, hit.amount));
        this.status.setAttribute("role", "status");
        this.confirm.textContent = redirecting ? "Confirm redirection" : "Confirm prevention";
        const update = () => {
            const assigned = inputs.reduce((sum, input) => sum + (input.valueAsNumber || 0), 0);
            this.status.textContent = `${assigned} of ${choice.total} damage selected`;
            this.confirm.disabled = assigned !== choice.total || inputs.some(input => !input.validity.valid);
        };
        form.addEventListener("input", update);
        form.addEventListener("submit", event => {
            event.preventDefault();
            choice.submit(choice.player, inputs.map(input => input.valueAsNumber));
        });
        form.append(this.status, this.confirm);
        this.panel.append(form);
        update();
    }

    private addNumberInput(form: HTMLFormElement, description: string, max: number) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "number";
        input.value = "0";
        input.min = "0";
        input.max = String(max);
        input.required = true;
        this.firstInput ??= input;
        label.append(description, input);
        form.append(label);
        return input;
    }

    open() {
        if (this.choice.kind !== ResolutionChoiceKind.Card || this.choice.visibility === CardChoiceVisibility.Public) {
            this.showPanel();
            return;
        }

        this.root.setVisibleHands(null);
        const dialog = document.createElement("dialog");
        this.handoff = dialog;
        dialog.className = "spell-target-dialog private-card-handoff";
        dialog.setAttribute("aria-labelledby", "private-card-handoff-heading");
        dialog.setAttribute("closedby", "none");
        dialog.addEventListener("cancel", event => event.preventDefault());

        const heading = document.createElement("h2");
        heading.id = "private-card-handoff-heading";
        heading.textContent = `Pass the screen to Player ${this.choice.player.id}`;
        const ready = document.createElement("button");
        ready.textContent = "Show my hand";
        ready.addEventListener("click", () => {
            this.root.setVisibleHands(this.choice.player);
            this.closeHandoff();
            this.showPanel();
        });
        dialog.append(heading, ready);
        document.body.append(dialog);
        dialog.showModal();
        ready.focus();
    }

    close() {
        this.closeHandoff();
        this.panel.remove();
        if (this.choice.kind === ResolutionChoiceKind.Card && this.choice.visibility === CardChoiceVisibility.Private)
            this.root.setVisibleHands();
    }

    private closeHandoff() {
        this.handoff?.close();
        this.handoff?.remove();
        this.handoff = undefined;
    }

    private showPanel() {
        document.body.append(this.panel);
        if (this.choice.kind === ResolutionChoiceKind.ManaPayment || this.choice.kind === ResolutionChoiceKind.Optional)
            this.confirm.focus();
        else if (this.firstInput) {
            this.firstInput.focus();
            this.firstInput.select();
        } else if (this.optionsList)
            this.panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        else
            this.root.focusCardSelection();
    }

    private update() {
        if (this.choice.kind === ResolutionChoiceKind.Card) {
            this.status.textContent = `${this.selection.count} of ${this.choice.count} selected`;
            this.confirm.disabled = this.selection.count !== this.choice.count;
        }
    }
}
