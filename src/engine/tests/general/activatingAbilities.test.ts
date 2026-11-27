import { PlayerActions } from "@engine/actions";
import playerActionManager,{ TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { GameEvent_ActivateAbility,GameEvent_GoToStep,GameEvent_TapCard } from "@engine/events";
import gameEventManager,{ type EventCheck,type GameEvent,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,FOREST,GRIZZLY_BEARS,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { AbilityActivator,CardType } from "~/defs";
import { cardData } from "~/index";

let player: Player;

beforeEach(async () => {
    Game.init();
    game.players.length = 0;
    player = game.addPlayer([]);
});

test("a mana ability taps its land and resolves without touching the stack", () => {
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    game.stack.spellCast(player, bears);

    const abilityEnteredStack = vi.spyOn(game.stack, "abilityActivated");
    const performed: GameEvent[] = [];
    const observe = (event: GameEvent) => performed.push(event);

    gameEventManager.onPerformed(GameEventType.All, observe);
    try {
        new PlayerActions.ActivateAbility(forest, forest.abilities[0]).perform(player);
    } finally {
        gameEventManager.offPerformed(GameEventType.All, observe);
    }

    expect(performed.map(event => event.type)).toEqual([GameEventType.TapCard, GameEventType.AddMana, GameEventType.ActivateAbility]);
    expect(performed[0].effect).toBeUndefined();
    expect(performed[1].effect?.ability).toBe(forest.abilities[0]);

    expect(abilityEnteredStack).not.toHaveBeenCalled();
    expect(game.stack.objects).toHaveLength(1);
    expect(game.stack.objects).toContainEqual(expect.objectContaining({ card: bears.card }));
    expect(forest.tapped).toBe(true);
    expect(player.manaPool[ManaColour.G]).toBe(1);
});

test("two queued activations cannot pay with the same tap", () => {
    startMainPhase();
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    const ability = forest.abilities[0];
    gameEventManager.addEvents([
        new GameEvent_ActivateAbility(player, forest, ability),
        new GameEvent_ActivateAbility(player, forest, ability),
    ]);

    expect(forest.tapped).toBe(true);
    expect(player.manaPool[ManaColour.G]).toBe(1);
});

test("a filtering mana ability can pay its activation cost from the pool and a land", () => {
    startMainPhase();
    const filter = addTestCard({
        ...cardData[GRIZZLY_BEARS], name: "Test mana filter", types: [CardType.Artifact],
        abilities: [{ isManaAbility: true, parts: {
            AbilityPart_Activate_Mana: { cost: "{2}" },
            AbilityPart_Activate_Tap: {},
            AbilityPart_Effect_AddMana: { target: "THIS.controller", mana: "{R}" },
        } }],
    }, player, player.battlefield);
    const land = addTestCard(cardData[FOREST], player, player.battlefield);
    expect(playerActionManager.getCardActions(filter, player)).toHaveLength(0);
    player.manaPool[ManaColour.U] = 1;
    playerActionManager.getCardActions(filter, player)[0].perform(player);
    expect(land.tapped).toBe(true);
    expect(filter.tapped).toBe(true);
    expect(player.manaPool).toEqual([0, 0, 0, 1, 0, 0]);
    expect(game.stack.objects).toHaveLength(0);
});

test("two queued activations cannot pay with the same mana", () => {
    startMainPhase();
    const creature = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: { AbilityPart_Activate_Mana: { cost: "{1}{G}" } } }],
    }, player, player.battlefield);
    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    player.manaPool[ManaColour.U] = 1;

    expect(playerActionManager.getCardActions(creature, player)).toHaveLength(1);
    const [ability] = creature.abilities;
    gameEventManager.addEvents([
        new GameEvent_ActivateAbility(player, creature, ability),
        new GameEvent_ActivateAbility(player, creature, ability),
    ]);

    expect(forest.tapped).toBe(true);
    expect(player.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
    expect(game.stack.objects).toHaveLength(1);
    expect(playerActionManager.getCardActions(creature, player)).toHaveLength(0);
});

test("an owner-only activation uses its owner's mana after a control change", () => {
    const opponent = game.addPlayer([]);
    startMainPhase();
    const creature = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{
            activator: AbilityActivator.Owner,
            parts: { AbilityPart_Activate_Mana: { cost: "{G}" } },
        }],
    }, player, player.battlefield);
    creature.controller = opponent;
    opponent.manaPool[ManaColour.G] = 1;
    expect(playerActionManager.getCardActions(creature, player)).toHaveLength(0);

    player.manaPool[ManaColour.G] = 1;
    const [activate] = playerActionManager.getCardActions(creature, player);
    activate.perform(player);
    expect(player.manaPool[ManaColour.G]).toBe(0);
    expect(opponent.manaPool[ManaColour.G]).toBe(1);
    expect(game.stack.objects[0]).toMatchObject({ controller: player, source: creature });
});

test("an activation with mana and tap costs reserves its source and only spends mana if it taps", () => {
    startMainPhase();
    const source = addTestCard({
        ...cardData[FOREST],
        abilities: [{ parts: {
            AbilityPart_Activate_Mana: { cost: "{G}" },
            AbilityPart_Activate_Tap: {},
        } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    const activate = () => gameEventManager.addEvent(new GameEvent_ActivateAbility(player, source, ability));

    activate();
    expect(source.tapped).toBe(false);
    expect(player.manaPool[ManaColour.G]).toBe(0);
    expect(game.stack.objects).toHaveLength(0);

    const forest = addTestCard(cardData[FOREST], player, player.battlefield);
    const blockTapAfterManaIsProduced = (check: EventCheck) => {
        if (forest.tapped)
            check.removeWhere(event => event instanceof GameEvent_TapCard && event.permanent === source);
    };
    gameEventManager.onCheck(blockTapAfterManaIsProduced);
    try {
        activate();
        expect(forest.tapped).toBe(true);
        expect(source.tapped).toBe(false);
        expect(player.manaPool[ManaColour.G]).toBe(1);
        expect(game.stack.objects).toHaveLength(0);
    } finally {
        gameEventManager.offCheck(blockTapAfterManaIsProduced);
    }

    activate();
    expect(source.tapped).toBe(true);
    expect(player.manaPool[ManaColour.G]).toBe(0);
    expect(game.stack.objects).toHaveLength(1);
});

test("targeted activations require a choice and each stack occurrence keeps its own target", () => {
    const opponent = game.addPlayer([]);
    startMainPhase();
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: {
            AbilityPart_Activate_Mana: { cost: "{R}" },
            AbilityPart_Target: { saveAs: "RECIPIENT", validTargets: [TargetTypeKeys.Player] },
            AbilityPart_Effect_DealDamage: { source: "THIS", assignments: [{ target: "RECIPIENT", amount: 1 }] },
        } }],
    }, player, player.battlefield);
    player.manaPool[ManaColour.R] = 2;
    const [ability] = source.abilities;

    gameEventManager.addEvent(new GameEvent_ActivateAbility(player, source, ability));
    expect(player.manaPool[ManaColour.R]).toBe(2);
    expect(game.stack.objects).toHaveLength(0);

    for (const target of [player, opponent]) {
        new PlayerActions.ActivateAbility(source, ability).perform(player);
        game.pendingTargeter.onTargeted([target]);
    }
    expect(player.manaPool[ManaColour.R]).toBe(0);
    expect(game.stack.objects).toHaveLength(2);
    passPriorityRound();
    expect(opponent.life).toBe(19);
    expect(player.life).toBe(20);
    passPriorityRound();
    expect(player.life).toBe(19);
});

test("temporary power and toughness modifiers add to changed base stats and expire at cleanup", () => {
    startMainPhase();
    const creature = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{
            parts: {
                AbilityPart_Activate_Mana: { cost: "{G}" },
                AbilityPart_Effect_ModifyPowerToughnessUntilEndOfTurn: {
                    recipient: "THIS",
                    power: -1,
                    toughness: 2,
                },
            },
        }],
    }, player, player.battlefield);
    player.manaPool[ManaColour.G] = 1;
    new PlayerActions.ActivateAbility(creature, creature.abilities[0]).perform(player);
    passPriorityRound();
    expect(creature).toMatchObject({ power: 1, toughness: 4 });

    creature.power = 4;
    creature.toughness = 3;
    expect(creature).toMatchObject({ power: 3, toughness: 5 });

    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
    expect(creature).toMatchObject({ power: 4, toughness: 3 });
});

test("sacrificing the source pays an activation cost before its nonmana ability goes on the stack", () => {
    startMainPhase();
    const creature = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: {
            AbilityPart_Activate_Sacrifice: {},
            AbilityPart_Effect_GainLife: { target: "CONTROLLER", amount: 2 },
        } }],
    }, player, player.battlefield);
    const [activate] = playerActionManager.getCardActions(creature, player);
    activate.perform(player);
    activate.perform(player);
    expect(player.graveyard.objects.map(object => object.card)).toEqual([creature.card]);
    expect(game.stack.objects).toHaveLength(1);
    expect(player.life).toBe(20);
    passPriorityRound();
    expect(player.life).toBe(22);
});
