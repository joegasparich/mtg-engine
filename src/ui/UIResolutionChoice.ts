import type { ResolutionChoice } from "@engine/events/GameEvent_ResolutionChoice";
import { Permanent } from "@engine/GameObject";
import { UICardSelection } from "@ui/UICardSelection";
import type UIRoot from "@ui/UIRoot";

export class UIResolutionChoice {
    private readonly panel = document.createElement("section");
    private readonly status = document.createElement("p");
    private readonly confirm = document.createElement("button");
    private readonly selection: UICardSelection;
    private handoff?: HTMLDialogElement;

    constructor(private readonly root: UIRoot, private readonly choice: ResolutionChoice) {
        this.selection = new UICardSelection(() => this.update(), choice.count);
        this.selection.setCards(choice.options);

        const heading = document.createElement("h2");
        heading.id = "resolution-choice-heading";
        heading.textContent = `${choice.sourceName} · Player ${choice.player.id}`;
        const prompt = document.createElement("p");
        prompt.textContent = choice.prompt;
        this.panel.className = "card-selection-panel resolution-choice-panel";
        this.panel.setAttribute("aria-labelledby", heading.id);
        this.status.setAttribute("role", "status");
        this.panel.append(heading, prompt, this.status);

        if (choice.visibility === "public" && choice.earlierChoices.length) {
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

    open() {
        if (this.choice.visibility === "public") {
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
        if (this.choice.visibility === "private")
            this.root.setVisibleHands();
    }

    private closeHandoff() {
        this.handoff?.close();
        this.handoff?.remove();
        this.handoff = undefined;
    }

    private showPanel() {
        document.body.append(this.panel);
        this.root.focusCardSelection();
    }

    private update() {
        this.status.textContent = `${this.selection.count} of ${this.choice.count} selected`;
        this.confirm.disabled = this.selection.count !== this.choice.count;
    }
}
