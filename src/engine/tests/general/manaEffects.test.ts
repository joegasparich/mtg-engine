import { GameEvent_ActivateAbility } from "@engine/events/GameEvent_ActivateAbility";
import type { GameEvent_LoseMana } from "@engine/events/GameEvent_LoseMana";
import { type GameEvent_RequestResolutionChoice,type ManaAbilityChoice,ResolutionChoiceKind } from "@engine/events/GameEvent_ResolutionChoice";
import gameEventManager,{ type EventCheck,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import type Player from "@engine/Player";
import { addTestCard,FOREST,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { type CardDef,CardType } from "~/defs";
import { cardData } from "~/index";

let caster: Player;
let opponent: Player;

beforeEach(() => {
    Game.init();
    caster = game.addPlayer([]);
    opponent = game.addPlayer([]);
    startMainPhase();
});

function castTestSpell(parts: CardDef["abilities"][number]["parts"]) {
    const spell = addTestCard({
        ...cardData[FOREST], name: "Test mana spell", cost: "", types: [CardType.Sorcery], subtypes: [],
        abilities: [{ parts: { AbilityPart_Target: { saveAs: "TARGET", validTargets: ["Player"] }, ...parts } }],
    }, caster, caster.hand);
    expect(game.stack.spellCast(caster, spell, [opponent])).toBe(true);
    passPriorityRound();
}

test("the instructed player chooses a legal mana ability from a selected permanent and activates it only once", () => {
    const permanent = addTestCard({
        ...cardData[FOREST], name: "Test artifact", types: [CardType.Artifact], subtypes: [],
        abilities: [
            { activateString: "{0}: Add {R}", isManaAbility: true, parts: {
                AbilityPart_Activate_Mana: { cost: "{0}" },
                AbilityPart_Effect_AddMana: { target: "THIS.controller", mana: "{R}" },
            } },
            { activateString: "{0}: Add one mana of any colour", isManaAbility: true, parts: {
                AbilityPart_Activate_Mana: { cost: "{0}" },
                AbilityPart_Effect_ChooseColour: { chooser: "THIS.controller", saveAs: "COLOUR", outSignal: "ADD_MANA" },
                AbilityPart_Effect_AddMana: { inSignal: "ADD_MANA", target: "THIS.controller", colourFrom: "COLOUR" },
            } },
            { activateString: "{T}: You gain 1 life", parts: {
                AbilityPart_Activate_Tap: {},
                AbilityPart_Effect_GainLife: { target: "THIS.controller", amount: 1 },
            } },
        ],
    }, opponent, opponent.battlefield);
    const forest = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
    let choice: ManaAbilityChoice;
    gameEventManager.onGamePerformed(GameEventType.RequestResolutionChoice, (event: GameEvent_RequestResolutionChoice) => {
        if (event.choice.kind === ResolutionChoiceKind.ManaAbility)
            choice = event.choice;
    });
    const activations = vi.fn();
    gameEventManager.onGamePerformed(GameEventType.ActivateAbility, activations);

    castTestSpell({
        AbilityPart_SelectObjects: {
            inSignal: "SPELL_RESOLVE", zone: ZoneKind.Battlefield, controlledBy: "TARGET", targetValidator: { cardType: CardType.Artifact },
            saveAs: "ARTIFACTS", outSignal: "ACTIVATE_MANA",
        },
        AbilityPart_Effect_ActivateManaAbilities: { inSignal: "ACTIVATE_MANA", player: "TARGET", permanentsFrom: "ARTIFACTS" },
    });
    expect(game.priorityPlayer).toBeNull();
    expect(choice.player).toBe(opponent);
    expect(choice.options).toEqual(["Test artifact · {0}: Add {R}", "Test artifact · {0}: Add one mana of any colour"]);
    gameEventManager.addEvent(new GameEvent_ActivateAbility(opponent, permanent, permanent.abilities[0]));
    choice.submit(caster, 0);
    choice.submit(opponent, -1);
    expect(activations).not.toHaveBeenCalled();

    choice.submit(opponent, 1);
    expect(game.pendingColourChoice.player).toBe(opponent);
    expect(game.stack.objects).toHaveLength(1);
    game.pendingColourChoice.submit(opponent, "B");
    expect(activations).toHaveBeenCalledTimes(1);
    expect(permanent.tapped).toBe(false);
    expect(forest.tapped).toBe(false);
    expect(opponent.life).toBe(20);
    expect(opponent.manaPool).toEqual([0, 0, 1, 0, 0, 0]);
    expect(game.stack.objects).toHaveLength(0);
});

test("clearing mana saves the amount lost for another part to add", () => {
    const pool = opponent.manaPool;
    pool[ManaColour.Colourless] = 3;
    caster.manaPool[ManaColour.G] = 1;
    const losses: GameEvent_LoseMana[] = [];
    gameEventManager.onGamePerformed(GameEventType.LoseMana, (event: GameEvent_LoseMana) => losses.push(event));

    castTestSpell({
        AbilityPart_Effect_ClearManaPool: { inSignal: "SPELL_RESOLVE", target: "TARGET", saveAs: "LOST_MANA", outSignal: "ADD_MANA" },
        AbilityPart_Effect_AddMana: { inSignal: "ADD_MANA", target: "THIS.controller", manaFrom: "LOST_MANA" },
    });

    expect(losses).toHaveLength(1);
    expect(losses[0]).toMatchObject({ player: opponent, mana: [0, 0, 0, 0, 0, 3] });
    expect(opponent.manaPool).toBe(pool);
    expect(pool).toEqual([0, 0, 0, 0, 0, 0]);
    expect(caster.manaPool).toEqual([0, 0, 0, 0, 1, 3]);
});

test("preventing the mana loss leaves the caster with no mana to add", () => {
    opponent.manaPool[ManaColour.U] = 1;
    const preventLoss = (check: EventCheck) => {
        check.removeWhere(event => event.type === GameEventType.LoseMana);
    };
    gameEventManager.onCheck(preventLoss);
    try {
        castTestSpell({
            AbilityPart_Effect_ClearManaPool: { inSignal: "SPELL_RESOLVE", target: "TARGET", saveAs: "LOST_MANA", outSignal: "ADD_MANA" },
            AbilityPart_Effect_AddMana: { inSignal: "ADD_MANA", target: "THIS.controller", manaFrom: "LOST_MANA" },
        });
    } finally {
        gameEventManager.offCheck(preventLoss);
    }

    expect(opponent.manaPool[ManaColour.U]).toBe(1);
    expect(caster.manaPool[ManaColour.U]).toBe(0);
});
