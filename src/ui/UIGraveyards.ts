import type { Targeter } from "@engine/actions";
import type { GameEvent_ChangeCardZone } from "@engine/events";
import type Player from "@engine/Player";

export class UIGraveyards {
    private readonly buttons = new Map<Player, HTMLButtonElement>();
    private readonly dialog = document.createElement("dialog");
    private readonly heading = document.createElement("h2");
    private readonly prompt = document.createElement("p");
    private readonly pileChoices = document.createElement("div");
    private readonly empty = document.createElement("p");
    private readonly grid = document.createElement("ul");
    private readonly closeButton = document.createElement("button");
    private player?: Player;
    private targeter?: Targeter;
    private targetPlayers: readonly Player[] = [];

    constructor(private readonly onTargetingFinished: () => void) {
        this.dialog.className = "spell-target-dialog graveyard-dialog";
        this.heading.id = "graveyard-heading";
        this.dialog.setAttribute("aria-labelledby", this.heading.id);
        this.prompt.className = "graveyard-prompt";
        this.pileChoices.className = "spell-target-choices graveyard-piles";
        this.grid.className = "graveyard-grid";
        this.empty.textContent = "This graveyard is empty.";

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

    addPlayer(player: Player) {
        const button = document.createElement("button");
        button.className = "graveyard-button";
        button.setAttribute("aria-haspopup", "dialog");
        // 404.2: Players may examine any graveyard.
        button.addEventListener("click", () => this.open(player));
        this.buttons.set(player, button);
        this.updateButton(player);
        return button;
    }

    onCardChangedZone(event: GameEvent_ChangeCardZone) {
        for (const player of this.buttons.keys()) {
            if (event.oldZone === player.graveyard || event.newZone === player.graveyard)
                this.updateButton(player);
        }

        if (this.targeter?.source === event.oldObject)
            this.dismiss();
        else if (this.player && (event.oldZone === this.player.graveyard || event.newZone === this.player.graveyard))
            this.renderPile();
    }

    openForTargeting(targeter: Targeter): boolean {
        if (targeter.count !== 1)
            return false;

        const players = [...this.buttons.keys()].filter(player =>
            player.graveyard.objects.some(card => targeter.validateTargets([card])));
        if (!players.length)
            return false;

        this.targeter = targeter;
        this.targetPlayers = players;
        this.open(players[0]);
        return true;
    }

    private updateButton(player: Player) {
        const button = this.buttons.get(player);
        const count = player.graveyard.objects.length;
        button.textContent = `Graveyard (${count})`;
        button.setAttribute("aria-label", `Player ${player.id} graveyard (${count})`);
    }

    private open(player: Player) {
        this.showPlayer(player);
        this.closeButton.textContent = this.targeter ? "Cancel" : "Close";
        if (!this.dialog.open)
            this.dialog.showModal();
        (this.grid.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? this.closeButton).focus();
    }

    private showPlayer(player: Player) {
        this.player = player;
        this.heading.textContent = `Player ${player.id}’s graveyard`;
        this.prompt.hidden = !this.targeter;
        if (this.targeter)
            this.prompt.textContent = `Choose a target for ${this.targeter.source.name}.`;
        this.pileChoices.replaceChildren();
        if (this.targetPlayers.length > 1) {
            for (const choice of this.targetPlayers) {
                const button = document.createElement("button");
                button.textContent = `Player ${choice.id}’s graveyard`;
                button.setAttribute("aria-pressed", String(choice === player));
                button.addEventListener("click", () => {
                    this.showPlayer(choice);
                    this.pileChoices.querySelector<HTMLButtonElement>("[aria-pressed=true]").focus();
                });
                this.pileChoices.append(button);
            }
        }
        this.renderPile();
    }

    private renderPile() {
        const { player, targeter } = this;
        const cards = player.graveyard.objects;
        this.empty.hidden = cards.length > 0;
        this.grid.setAttribute("aria-label", `Player ${player.id}’s graveyard, newest first`);
        // 404.1: The most recently added card is on top of the graveyard.
        this.grid.replaceChildren(...cards.slice().reverse().map(card => {
            const item = document.createElement("li");
            const image = document.createElement("img");
            image.src = card.def.image_url;
            image.alt = card.name;

            if (!targeter) {
                item.append(image);
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
        this.player = undefined;
        this.targeter = undefined;
        this.targetPlayers = [];
        this.dialog.close();
    }
}
