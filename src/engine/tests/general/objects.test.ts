import { PlayerActions } from "@engine/actions";
import { GameEvent_ActivateAbility,GameEvent_ChangeCardZone,GameEvent_GoToStep,GameEvent_TapCard,GameEvent_UntapCard } from "@engine/events";
import type { GameEvent_StackAbilityChanged } from "@engine/events/GameEvent_StackAbilityChanged";
import gameEventManager,{ GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { Permanent,Spell,StackAbility } from "@engine/GameObject";
import { ManaColour } from "@engine/mana";
import { StepIndex } from "@engine/Step";
import { addTestCard,moveTestCard,ANCESTRAL_RECALL,FOREST,GRIZZLY_BEARS,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { CardType } from "~/defs";
import { cardData } from "~/index";

beforeEach(() => Game.init());

test("casting, resolving, leaving, and returning create distinct objects for one card", () => {
    const player = game.addPlayer([]);
    const handObject = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);

    expect(game.stack.spellCast(player, handObject)).toBe(true);
    const spell = game.stack.objects.find(object => object instanceof Spell);
    expect(spell).toBeInstanceOf(Spell);
    expect(handObject.retired).toBe(true);
    expect(player.hand.objects).toEqual([]);

    game.stack.resolveAll();
    const [permanent] = player.battlefield.objects;
    expect(permanent).toBeInstanceOf(Permanent);
    expect(spell.retired).toBe(true);

    permanent.tapped = true;
    permanent.damageTaken = 1;
    const graveyardObject = moveTestCard(permanent, player.graveyard);
    const returned = moveTestCard(graveyardObject, player.battlefield);
    expect(returned.tapped).toBe(false);
    expect(returned.damageTaken).toBe(0);
    expect(graveyardObject.controller).toBeUndefined();

    const objects = [handObject, spell, permanent, graveyardObject, returned];
    expect(new Set(objects.map(object => object.id)).size).toBe(objects.length);
    expect(new Set(objects.map(object => object.card))).toEqual(new Set([handObject.card]));
});

test("a stale action and queued events cannot affect a replacement object", () => {
    const player = game.addPlayer([]);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    const handObject = addTestCard(cardData[GRIZZLY_BEARS], player, player.hand);
    const play = new PlayerActions.PlayCard(handObject);
    player.manaPool[ManaColour.G] = 2;
    const temporary = moveTestCard(handObject, player.graveyard);
    const replacement = moveTestCard(temporary, player.hand);

    play.perform(player);
    expect(player.manaPool[ManaColour.G]).toBe(2);
    expect(player.hand.objects).toEqual([replacement]);

    const permanent = moveTestCard(replacement, player.battlefield);
    const obsoleteMove = new GameEvent_ChangeCardZone(permanent, player.hand);
    const sameZone = new GameEvent_ChangeCardZone(permanent, player.battlefield);
    expect(gameEventManager.performImmediate(sameZone)).toBe(false);
    const newPermanent = moveTestCard(moveTestCard(permanent, player.graveyard), player.battlefield);
    expect(gameEventManager.performImmediate(obsoleteMove)).toBe(false);
    expect(gameEventManager.performImmediate(new GameEvent_TapCard(permanent))).toBe(false);
    expect(newPermanent.tapped).toBe(false);
    expect(player.battlefield.objects).toEqual([newPermanent]);
});

test("a target request ends when its source object leaves the hand", () => {
    const player = game.addPlayer([]);
    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
    player.manaPool[ManaColour.U] = 1;
    const source = addTestCard(cardData[ANCESTRAL_RECALL], player, player.hand);
    new PlayerActions.PlayCard(source).perform(player);
    const request = game.pendingTargeter;
    expect(request?.source).toBe(source);

    const replacement = moveTestCard(moveTestCard(source, player.graveyard), player.hand);
    expect(game.pendingTargeter).toBeNull();
    request.onTargeted([player]);
    expect(player.manaPool[ManaColour.U]).toBe(1);
    expect(player.hand.objects).toEqual([replacement]);
});

test("a retired spell cannot resolve a second time", () => {
    const player = game.addPlayer([FOREST, FOREST, FOREST, FOREST]);
    const recall = addTestCard(cardData[ANCESTRAL_RECALL], player, player.hand);
    expect(game.stack.spellCast(player, recall, [player])).toBe(true);
    const spell = game.stack.objects.find(object => object instanceof Spell);

    game.stack.resolveAll();
    game.stack.resolveSpell(spell);

    expect(player.hand.objects).toHaveLength(3);
    expect(player.library.objects).toHaveLength(1);
});

test("two nonmana activations of one permanent create independent stack objects", () => {
    const player = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    startMainPhase();
    addTestCard(cardData[FOREST], player, player.library);
    addTestCard(cardData[FOREST], opponent, opponent.library);
    const source = addTestCard({
        ...cardData[FOREST],
        abilities: [{
            parts: {
                AbilityPart_Activate_Tap: { outSignal: "DRAW" },
                AbilityPart_Effect_DrawCards: { inSignal: "DRAW", target: "RECIPIENT", count: 1 },
            },
        }],
    }, player, player.battlefield);
    const [ability] = source.abilities;
    const recipients = [player];
    ability.slate.RECIPIENT = recipients;

    const first = new GameEvent_ActivateAbility(player, source, ability);
    first.then(() => { recipients[0] = opponent; });
    const second = new GameEvent_ActivateAbility(player, source, ability);
    let occurrences: StackAbility[];
    second.then(() => { occurrences = game.stack.objects.filter(object => object instanceof StackAbility); });
    const changes: GameEvent_StackAbilityChanged[] = [];
    const recordChange = (event: GameEvent_StackAbilityChanged) => changes.push(event);
    gameEventManager.onPerformed(GameEventType.StackAbilityChanged, recordChange);
    try {
        gameEventManager.addEvents([first, new GameEvent_UntapCard(source), second]);

        expect(occurrences).toHaveLength(2);
        expect(occurrences[0].id).not.toBe(occurrences[1].id);
        expect(occurrences.map(object => object.source)).toEqual([source, source]);
        expect(occurrences.map(object => object.ability.slate.RECIPIENT)).toEqual([[player], [opponent]]);
        passPriorityRound();
        expect(occurrences[0].retired).toBe(false);
        expect(occurrences[1].retired).toBe(true);
        passPriorityRound();
        expect(occurrences.every(object => object.retired)).toBe(true);
        expect(player.hand.objects).toHaveLength(1);
        expect(opponent.hand.objects).toHaveLength(1);
        expect(game.stack.objects).toHaveLength(0);
    } finally {
        gameEventManager.offPerformed(GameEventType.StackAbilityChanged, recordChange);
    }

    const [lower, upper] = occurrences;
    expect(changes.map(({ ability, onStack }) => [ability.id, onStack])).toEqual([
        [lower.id, true], [upper.id, true], [upper.id, false], [lower.id, false],
    ]);
});

test("an enters trigger resolves with its original controller after its source leaves", () => {
    const player = game.addPlayer([FOREST]);
    const opponent = game.addPlayer([FOREST]);
    const source = addTestCard({
        ...cardData[FOREST],
        types: [CardType.Enchantment],
        abilities: [{
            parts: {
                AbilityPart_Trigger_Enters: { type: CardType.Creature, outSignal: "DRAW", storeAs: "ENTERED" },
                AbilityPart_Effect_DrawCards: { inSignal: "DRAW", target: "CONTROLLER", count: 1 },
            },
        }],
    }, player, player.battlefield);
    const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.hand);
    const enter = new GameEvent_ChangeCardZone(creature, opponent.battlefield);
    enter.then(() => { source.controller = opponent; });
    const observe = new GameEvent_Log(GameEventType.Log, "Read the trigger after its source leaves");
    let trigger: StackAbility;
    observe.then(() => {
        expect(game.stack.objects).toHaveLength(0);
        gameEventManager.onIdle(() => { trigger = game.stack.objects.find(object => object instanceof StackAbility); });
    });

    gameEventManager.addEvents([enter, new GameEvent_ChangeCardZone(source, player.graveyard), observe]);

    expect(trigger.source).toBe(source);
    expect(trigger.controller).toBe(player);
    expect(trigger.ability.slate.ENTERED).toEqual([enter.newObject]);
    expect(source.retired).toBe(true);
    game.stack.resolveAll();
    expect(trigger.retired).toBe(true);
    expect(player.hand.objects).toHaveLength(1);
    expect(opponent.hand.objects).toHaveLength(0);
});

test("a permanent with two printed types matches either target restriction across zone changes", () => {
    const player = game.addPlayer([]);
    const def = { ...cardData[GRIZZLY_BEARS], types: [CardType.Creature, CardType.Artifact] };
    const creature = addTestCard(def, player, player.battlefield);
    const disenchant = addTestCard(cardData.find(card => card.name === "Disenchant"), player, player.hand);
    expect(creature.hasType(CardType.Creature)).toBe(true);
    expect(disenchant.spellTargeter.validateTargets([creature])).toBe(true);
    creature.types = [CardType.Land, CardType.Artifact];
    expect(creature.hasType(CardType.Creature)).toBe(false);
    expect(disenchant.spellTargeter.validateTargets([creature])).toBe(true);
    expect(creature.def.types).toEqual([CardType.Creature, CardType.Artifact]);
    creature.types = [CardType.Land];
    expect(disenchant.spellTargeter.validateTargets([creature])).toBe(false);
    expect(moveTestCard(creature, player.hand).types).toEqual([CardType.Creature, CardType.Artifact]);
});
