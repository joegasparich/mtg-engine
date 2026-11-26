import { selectObjectsFromZone } from "@engine/abilities/ZoneSelection";
import { PlayerAction_ActivateAbility,TargetType,TargetTypeKeys } from "@engine/actions";
import { GameEvent_CheckTarget } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager,{ type EventCheck,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { type Spell,StackAbility } from "@engine/GameObject";
import { addTestCard,BASIC_DECK,FOREST,GRIZZLY_BEARS,moveTestCard,startMainPhase } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { CardType } from "~/defs";
import { cardData } from "~/index";

test("a signalled selection stores a snapshot of matching cards in the chosen player's hand", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const matchingCard = addTestCard(creature, opponent, opponent.hand);
    addTestCard(cardData[FOREST], opponent, opponent.hand);
    addTestCard(creature, player, player.hand);
    const source = addTestCard({
        ...creature,
        abilities: [{ parts: {
            AbilityPart_SelectObjectsFromZone: {
                inSignal: "SELECT",
                saveAs: "CHOSEN",
                zone: ZoneKind.Hand,
                zoneOf: "PLAYER",
                targetValidator: { cardType: CardType.Creature },
            },
        } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;

    ability.fireSignal("SELECT");
    expect(ability.slate.CHOSEN).toEqual([]);
    ability.slate.PLAYER = [opponent];
    ability.fireSignal("SELECT");
    expect(ability.slate.CHOSEN).toEqual([matchingCard]);

    moveTestCard(matchingCard, opponent.graveyard);
    expect(ability.slate.CHOSEN).toEqual([matchingCard]);
    ability.fireSignal("SELECT");
    expect(ability.slate.CHOSEN).toEqual([]);
});

test("damage can use the size of a slate selection and deals nothing for an empty list", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const source = addTestCard({
        ...creature,
        abilities: [{ parts: {
            AbilityPart_Effect_DealDamage: { source: "THIS", target: "RECIPIENT", amount: { countFrom: "SELECTED" } },
        } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    ability.slate.RECIPIENT = [opponent];
    ability.slate.SELECTED = [];
    const onDamage = vi.fn();
    const stopListening = gameEventManager.onGamePerformed(GameEventType.DealDamage, onDamage);
    try {
        ability.fireSignal("default");
        expect(opponent.life).toBe(20);
        expect(onDamage).not.toHaveBeenCalled();

        ability.slate.SELECTED = [
            addTestCard(creature, player, player.hand),
            addTestCard(creature, player, player.hand),
        ];
        ability.fireSignal("default");
        expect(opponent.life).toBe(18);
        expect(onDamage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source, recipient: opponent, amount: 2 }));
    } finally {
        stopListening();
    }
});

test("a live graveyard selection sees cards from every player enter and leave", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const source = addTestCard({
        ...creature,
        abilities: [{ parts: {
            AbilityPart_SelectObjectsFromZoneContinuously: {
                saveAs: "GRAVEYARD_CARDS",
                zone: ZoneKind.Graveyard,
            },
        } }],
    }, player, player.battlefield);
    const { slate } = source.abilities[0];
    expect(slate.GRAVEYARD_CARDS).toEqual([]);

    const ownCard = addTestCard(creature, player, player.graveyard);
    const opposingCard = addTestCard(cardData[FOREST], opponent, opponent.graveyard);
    expect(slate.GRAVEYARD_CARDS).toEqual([ownCard, opposingCard]);

    moveTestCard(ownCard, player.library);
    expect(slate.GRAVEYARD_CARDS).toEqual([opposingCard]);
});

test("an unscoped graveyard target can return a card from another player's graveyard", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const opposingCard = addTestCard(creature, opponent, opponent.graveyard);
    const source = addTestCard({
        ...cardData.find(card => card.name === "Resurrection"),
        abilities: [{ parts: {
            AbilityPart_Target: { zone: ZoneKind.Graveyard, saveAs: "CHOSEN", targetValidator: { cardType: CardType.Creature } },
            AbilityPart_Effect_ChangeZones: { inSignal: "SPELL_RESOLVE", target: "CHOSEN", destination: ZoneKind.Battlefield },
        } }],
    }, player, player.hand);

    expect(source.spellTargeter.hasLegalTargets()).toBe(true);
    const forbidTarget = (check: EventCheck) => check.removeWhere(event =>
        event instanceof GameEvent_CheckTarget && event.target === opposingCard);
    gameEventManager.onCheck(forbidTarget);
    try {
        expect(source.spellTargeter.hasLegalTargets()).toBe(false);
        expect(game.stack.spellCast(player, source, [opposingCard])).toBe(false);
    } finally {
        gameEventManager.offCheck(forbidTarget);
    }

    expect(game.stack.spellCast(player, source, [opposingCard])).toBe(true);
    game.stack.resolveAll();
    expect(opponent.graveyard.objects).toEqual([]);
    expect(player.battlefield.objects).toEqual([expect.objectContaining({ card: opposingCard.card, controller: player, owner: opponent })]);
});

test("a configured battlefield target scopes the activation request to the chosen player's zone", () => {
    Game.init();
    const player = game.addPlayer(BASIC_DECK);
    const opponent = game.addPlayer(BASIC_DECK);
    startMainPhase();
    const creature = cardData[GRIZZLY_BEARS];
    const source = addTestCard({
        ...creature,
        abilities: [{ parts: {
            AbilityPart_Activate_Mana: { cost: "{0}" },
            AbilityPart_Target: { zone: ZoneKind.Battlefield, zoneOf: "THIS.controller", saveAs: "CHOSEN" },
        } }],
    }, player, player.battlefield);
    const opposingPermanent = addTestCard(creature, opponent, opponent.battlefield);
    const cardInGraveyard = addTestCard(creature, player, player.graveyard);

    new PlayerAction_ActivateAbility(source, source.abilities[0]).perform(player);

    const request = game.pendingTargeter;
    expect(request).toMatchObject({ zone: ZoneKind.Battlefield, targetType: TargetType.Permanent });
    expect(request.validateTargets([source])).toBe(true);
    expect(request.validateTargets([opposingPermanent])).toBe(false);
    expect(request.validateTargets([cardInGraveyard])).toBe(false);
});

test("a configured stack target can choose a spell other than itself", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const target = addTestCard(creature, opponent, opponent.hand);
    const source = addTestCard({
        ...creature,
        types: [CardType.Instant],
        abilities: [{ parts: { AbilityPart_Target: { zone: ZoneKind.Stack, saveAs: "CHOSEN" } } }],
    }, player, player.hand);

    expect(source.spellTargeter.targetTypes).toEqual([TargetTypeKeys.Spell]);
    expect(source.spellTargeter.hasLegalTargets()).toBe(false);
    expect(game.stack.spellCast(opponent, target)).toBe(true);
    const [targetSpell] = game.stack.objects;
    expect(source.spellTargeter.hasLegalTargets()).toBe(true);
    expect(game.stack.spellCast(player, source, [targetSpell])).toBe(true);
    const spell = game.stack.objects.at(-1) as Spell;
    expect(spell.spellTargeter.validateTargets([spell])).toBe(false);
});

test("selection from the shared stack supports spells and stack abilities", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const creature = cardData[GRIZZLY_BEARS];
    const card = addTestCard(creature, player, player.hand);
    const source = addTestCard({ ...creature, abilities: [{ parts: {} }] }, opponent, opponent.battlefield);
    const [ability] = source.abilities;
    expect(game.stack.spellCast(player, card)).toBe(true);
    const [spell] = game.stack.objects;
    const stackAbility = new StackAbility(opponent, source, ability, "unused");
    game.stack.onEnter(stackAbility);

    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Stack })).toEqual([spell, stackAbility]);
    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Stack, controlledBy: "THIS.controller" })).toEqual([stackAbility]);
    expect(selectObjectsFromZone(ability, {
        zone: ZoneKind.Stack, targetValidator: { cardType: CardType.Creature },
    })).toEqual([spell]);
    const cardTypes = [CardType.Creature, CardType.Artifact];
    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Stack, targetValidator: { cardTypes } })).toEqual([spell]);
    const targetValidator = { cardTypes, onBattlefield: true };
    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Stack, targetValidator })).toEqual([]);
    expect(selectObjectsFromZone(ability, { zone: ZoneKind.Battlefield, targetValidator })).toEqual([source]);
});

test("a resolving ability can choose a card from a zone and pass it to another effect", () => {
    Game.init();
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    const source = addTestCard({
        ...cardData[GRIZZLY_BEARS],
        abilities: [{ parts: {
            AbilityPart_ChooseObject: {
                selection: { zone: ZoneKind.Graveyard, zoneOf: "THIS.controller", targetValidator: { cardType: CardType.Creature } },
                prompt: "Choose a creature card to return.", saveAs: "CHOSEN", outSignal: "RETURN",
            },
            AbilityPart_Effect_ChangeZones: { inSignal: "RETURN", target: "CHOSEN", destination: ZoneKind.Hand },
        } }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    const bears = addTestCard(cardData[GRIZZLY_BEARS], player, player.graveyard);
    const forest = addTestCard(cardData[FOREST], player, player.graveyard);
    addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.graveyard);

    ability.fireSignal("default");
    const choice = game.pendingResolutionChoice;
    expect(choice.options).toEqual([bears]);
    choice.submit(opponent, [bears]);
    choice.submit(player, [forest]);
    expect(game.pendingResolutionChoice).toBe(choice);
    choice.submit(player, [bears]);
    expect(ability.slate.CHOSEN).toEqual([bears]);
    expect(player.hand.objects.map(object => object.card)).toEqual([bears.card]);

    ability.fireSignal("default");
    expect(game.hasPendingPlayerInput).toBe(false);
    expect(ability.slate.CHOSEN).toEqual([]);
});
