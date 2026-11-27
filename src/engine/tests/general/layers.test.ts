import { RulesEventType } from "@engine/events/RulesEvent";
import { AbilityPart,makeAbility } from "@engine/abilities";
import { AbilityParts } from "@engine/abilities/registry";
import { abilityGrant,AbilityRemoval,removeAbilities } from "@engine/effects/AbilityGrant";
import { change,type Characteristics,Layer,type LayerEffect } from "@engine/effects/Layers";
import { statModifier } from "@engine/effects/PowerToughness";
import { CardChoicePresentation,CardChoiceVisibility,GameEvent_ChangeCardZone,GameEvent_DestroyPermanent,GameEvent_SacrificePermanent,OptionalDecision,GameEvent_TapCard,GameEvent_UntapCard } from "@engine/events";
import { GameEvent_AttachPermanent } from "@engine/events/GameEvent_AttachPermanent";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type { CardObject,Spell } from "@engine/GameObject";
import { ManaColour } from "@engine/mana";
import type Player from "@engine/Player";
import { addTestCard,GRIZZLY_BEARS,moveTestCard } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { BasicLandType,CardType,Keyword,type CardColour } from "~/defs";
import { cardData } from "~/index";

const layers = gameEventManager.effects.layers;
const bears = cardData[GRIZZLY_BEARS];
let player: Player;
let opponent: Player;

beforeEach(() => {
    Game.init();
    player = game.addPlayer([]);
    opponent = game.addPlayer([]);
});

function staticAbility(source: CardObject, effect: LayerEffect) {
    class Static extends AbilityPart {
        layerEffect() { return effect; }
    }
    const ability = makeAbility({ parts: {} }, source);
    ability.addPart(new Static());
    source.abilities = [...source.abilities, ability];
    return ability;
}

function setColour(colour: CardColour) {
    return change(Layer.Colour, () => [colour] as const, (state, value) => { state.colours = new Set([value]); });
}

function setPT(power: number, toughness: number, layer = Layer.SetPT) {
    return change(layer, () => [power, toughness] as const, (state, p, t) => { state.power = p; state.toughness = t; });
}

function landEffect(from: BasicLandType, to: BasicLandType) {
    return { ...bears, types: [CardType.Enchantment], abilities: [{ parts: {
        AbilityPart_SelectObjectsContinuously: { zone: ZoneKind.Battlefield, saveAs: "LANDS",
            targetValidator: { cardType: CardType.Land, cardSubtype: from } },
        AbilityPart_SetBasicLandType: { landsFrom: "LANDS", landType: to },
    } }] };
}

test("all layers and P/T sublayers apply in rules order even with opposite timestamps", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const select = () => [target];
    const flying = abilityGrant({ keyword: Keyword.Flying, parts: {} }, target, () => target.timestamp);
    const effects: LayerEffect[] = [
        { select, changes: [change(Layer.Copy, () => [] as const, state => { state.name = "Copy"; })] },
        { select: () => target.name === "Copy" ? [target] : [],
            changes: [change(Layer.FaceDown, () => [] as const, state => { state.name = "Face down"; })] },
        { select: () => target.name === "Face down" ? [target] : [],
            changes: [change(Layer.Control, () => [opponent] as const, (state, p) => { state.controller = p; })] },
        { select: () => target.controller === opponent ? [target] : [],
            changes: [change(Layer.Text, () => [] as const, state => { state.rulesText = "Changed text"; })] },
        { select: () => target.characteristics.rulesText === "Changed text" ? [target] : [],
            changes: [change(Layer.Type, () => [] as const, state => { state.types = [...state.types, CardType.Artifact]; })] },
        { select: () => target.hasType(CardType.Artifact) ? [target] : [], changes: [setColour("U")] },
        { select: () => target.colours.has("U") ? [target] : [], changes: [flying.change] },
        { select: () => target.hasKeyword(Keyword.Flying) ? [target] : [], changes: [setPT(1, 2, Layer.DefinePT)] },
        { select: () => target.power === 1 ? [target] : [], changes: [setPT(3, 4)] },
        { select, changes: [statModifier(2, 3)] },
        { select, changes: [change(Layer.SwitchPT, () => [] as const, state => {
            [state.power, state.toughness] = [state.toughness, state.power];
        })] },
    ];
    for (const effect of effects.reverse()) layers.register(effect);
    expect(target.characteristics).toMatchObject({ name: "Face down", rulesText: "Changed text", controller: opponent,
        basePower: 3, baseToughness: 4, power: 7, toughness: 5 });
    expect(layers.copiable(target).name).toBe("Face down");
    expect(target.zone).toBe(opponent.battlefield);
});

test.each([true, false])("Conversion follows a land made into a Mountain (Conversion first %s)", first => {
    const forest = addTestCard(cardData.find(def => def.name === "Forest"), player, player.battlefield);
    const conversion = cardData.find(def => def.name === "Conversion");
    const mountains = landEffect(BasicLandType.Forest, BasicLandType.Mountain);
    const [a, b] = (first ? [conversion, mountains] : [mountains, conversion])
        .map(def => addTestCard(def, opponent, opponent.battlefield));
    expect(forest.subtypes).toEqual([BasicLandType.Plains]);
    expect(forest.abilities[0].getPotentialMana()).toEqual([1, 0, 0, 0, 0, 0]);
    moveTestCard(first ? a : b, opponent.graveyard);
    expect(forest.subtypes).toEqual([BasicLandType.Mountain]);
});

test("new dependencies are discovered after applying another effect", () => {
    const land = addTestCard(cardData.find(def => def.name === "Island"), player, player.battlefield);
    for (const [from, to] of [
        [BasicLandType.Island, BasicLandType.Forest],
        [BasicLandType.Mountain, BasicLandType.Plains],
        [BasicLandType.Forest, BasicLandType.Mountain],
    ]) addTestCard(landEffect(from, to), player, player.battlefield);
    expect(land.subtypes).toEqual([BasicLandType.Plains]);
});

test.each([true, false])("a dependency loop uses timestamp order (Forests change first %s)", first => {
    const lands = ["Forest", "Mountain"].map(name => addTestCard(cardData.find(def => def.name === name), player, player.battlefield));
    const a = landEffect(BasicLandType.Forest, BasicLandType.Mountain);
    const b = landEffect(BasicLandType.Mountain, BasicLandType.Forest);
    for (const def of first ? [a, b] : [b, a]) addTestCard(def, player, player.battlefield);
    for (const land of lands) expect(land.subtypes).toEqual([first ? BasicLandType.Forest : BasicLandType.Mountain]);
});

test("changing what an effect does on another object overrides timestamp order", () => {
    const one = addTestCard(bears, player, player.battlefield);
    const two = addTestCard(bears, opponent, opponent.battlefield);
    layers.register({ select: () => [one], changes: [change(Layer.SetPT, () => [two.power] as const,
        (state, power) => { state.power = power; })] });
    layers.register({ select: () => [two], changes: [setPT(8, 8)] });
    expect(one.power).toBe(8);
    expect(two.power).toBe(8);
});

test("switching from setting power to setting toughness creates a dependency with identical operands", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const reference = addTestCard(bears, opponent, opponent.battlefield);
    const setPower = change(Layer.SetPT, () => [1] as const, (state, n) => { state.power = n; });
    const setToughness = change(Layer.SetPT, () => [1] as const, (state, n) => { state.toughness = n; });
    layers.register({ select: () => [target], changes: [{
        layer: Layer.SetPT,
        prepare: object => (reference.power === 8 ? setToughness : setPower).prepare(object),
    }] });
    expect(target.getPowerToughness()).toEqual({ power: 1, toughness: 2 });
    const end = layers.register({ select: () => [reference], changes: [setPT(8, 8)] });
    expect(target.getPowerToughness()).toEqual({ power: 2, toughness: 1 });
    end();
    expect(target.getPowerToughness()).toEqual({ power: 1, toughness: 2 });
});

test("preparing the same operation with equal inputs preserves timestamp order", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const reference = addTestCard(bears, opponent, opponent.battlefield);
    const setPower = (state: Characteristics, n: number) => { state.power = n; };
    const fixed = change(Layer.SetPT, () => [1] as const, setPower);
    const halfToughness = change(Layer.SetPT, object => [object.toughness / 2] as const, setPower);
    layers.register({ select: () => [target], changes: [{
        layer: Layer.SetPT,
        prepare: object => (reference.power === 8 ? fixed : halfToughness).prepare(object),
    }] });
    layers.register({ select: () => [target, reference], changes: [setPT(8, 8)] });
    expect(target.power).toBe(8);
});

test("independent effects use timestamps and removing the latest restores the older effect", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const select = () => [target];
    const stopRed = layers.register({ select, changes: [setColour("R")] });
    const stopBlue = layers.register({ select, changes: [setColour("U")] });
    expect(target.colours).toEqual(new Set(["U"]));
    stopBlue();
    stopBlue();
    expect(target.colours).toEqual(new Set(["R"]));
    stopRed();
    expect(target.colours).toEqual(new Set(["G"]));
});

test("characteristic-defining abilities precede ordinary effects and function outside the battlefield", () => {
    const card = addTestCard(bears, player, player.hand);
    const select = () => [card];
    const end = layers.register({ select, changes: [setColour("B")] });
    staticAbility(card, { select, characteristicDefining: true, changes: [setColour("U"), setPT(4, 5, Layer.DefinePT)] });
    expect(card.colours).toEqual(new Set(["B"]));
    expect(card.getPowerToughness()).toEqual({ power: 4, toughness: 5 });
    end();
    expect(card.colours).toEqual(new Set(["U"]));
});

test("removing a source ability in the same layer can eliminate its effect before it applies", () => {
    const source = addTestCard(bears, player, player.battlefield);
    const recipient = addTestCard(bears, opponent, opponent.battlefield);
    const flying = abilityGrant({ keyword: Keyword.Flying, parts: {} }, source, () => source.timestamp);
    staticAbility(source, { select: () => [recipient], changes: [flying.change] });
    expect(recipient.hasKeyword(Keyword.Flying)).toBe(true);
    const end = layers.register({ select: () => [source], changes: [
        change(Layer.Ability, () => [] as const, state => { state.abilities = []; }),
    ] });
    expect(recipient.hasKeyword(Keyword.Flying)).toBe(false);
    end();
    expect(recipient.hasKeyword(Keyword.Flying)).toBe(true);
});

test("a multilayer effect keeps its original recipients after its own condition and ability disappear", () => {
    const source = addTestCard(bears, player, player.battlefield);
    const artifact = addTestCard({ ...bears, types: [CardType.Artifact] }, opponent, opponent.battlefield);
    staticAbility(source, { select: () => artifact.hasType(CardType.Creature) ? [] : [artifact],
        changes: [change(Layer.Type, () => [] as const, state => { state.types = [...state.types, CardType.Creature]; }), setPT(6, 7)] });
    layers.register({ select: () => [source], changes: [change(Layer.Ability, () => [] as const, state => { state.abilities = []; })] });
    expect(source.abilities).toEqual([]);
    expect(artifact.types).toContain(CardType.Creature);
    expect(artifact.getPowerToughness()).toEqual({ power: 6, toughness: 7 });
    moveTestCard(source, player.graveyard);
    expect(artifact.types).toEqual([CardType.Artifact]);
    expect(artifact.power).toBe(2);
});

test("tapping and untapping reconcile a shared ability grant and stat modifier before observers", () => {
    const target = addTestCard(bears, player, player.battlefield);
    addTestCard({ ...bears, abilities: [{ parts: {
        AbilityPart_SelectObjectsContinuously: { zone: ZoneKind.Battlefield, saveAs: "TAPPED",
            targetValidator: { cardType: CardType.Creature, tapped: true } },
        AbilityPart_ModifyPowerToughness: { permanentsFrom: "TAPPED", power: 1, toughness: 2 },
        AbilityPart_GrantAbilityContinuously: { permanentsFrom: "TAPPED", grant: { keyword: Keyword.Flying } },
    } }] }, player, player.battlefield);
    const observed: number[] = [];
    gameEventManager.rules.on(RulesEventType.BecomesTapped, () => {
        expect(target.hasKeyword(Keyword.Flying)).toBe(true);
        observed.push(target.power);
    });
    gameEventManager.addEvent(new GameEvent_TapCard(target));
    const [flight] = target.abilities;
    expect(target.abilities[0]).toBe(flight);
    expect(observed).toEqual([3]);
    expect(target.toughness).toBe(4);
    gameEventManager.addEvent(new GameEvent_UntapCard(target));
    expect(target.hasKeyword(Keyword.Flying)).toBe(false);
    expect(target.getPowerToughness()).toEqual({ power: 2, toughness: 2 });
});

test("a granted static ability takes its grant's timestamp and appears in the same evaluation", () => {
    class SetBaseSix extends AbilityPart {
        layerEffect() { return { select: () => [this.ability.source], changes: [setPT(6, 6)] }; }
    }
    AbilityParts.SetBaseSix = SetBaseSix;
    try {
        const target = addTestCard(bears, player, player.battlefield);
        layers.register({ select: () => [target], changes: [setPT(3, 3)] });
        const grant = target.grantAbility({ parts: { SetBaseSix: {} } }, target);
        expect(target.power).toBe(6);
        grant.revoke();
        expect(target.power).toBe(3);
    } finally { delete AbilityParts.SetBaseSix; }
});

test("copies take layer-one values, rebind abilities and ignore later text, colour and P/T", () => {
    const original = addTestCard(bears, player, player.battlefield);
    layers.register({ select: () => [original], changes: [
        change(Layer.FaceDown, () => [] as const, state => { state.name = "Layer one"; state.power = 4; }),
        change(Layer.Text, () => [] as const, state => { state.name = "Later name"; }),
        setColour("U"), statModifier(1, 1),
    ] });
    const clone = addTestCard(cardData.find(def => def.name === "Clone"), opponent, opponent.hand);
    const move = new GameEvent_ChangeCardZone(clone, opponent.battlefield);
    gameEventManager.addEvent(move);
    expect(game.pendingOptionalChoice).toBeTruthy();
    game.pendingOptionalChoice.submit(opponent, OptionalDecision.Accept);
    game.pendingResolutionChoice.submit(opponent, [original]);
    expect(original).toMatchObject({ name: "Later name", power: 5 });
    expect(move.newObject).toMatchObject({ name: "Layer one", power: 4, toughness: 2, colours: new Set(["G"]) });
});

test("simultaneous entry assigns timestamps in APNAP and each controller's chosen order", () => {
    const active = game.currentTurnPlayer();
    const other = game.players.find(p => p !== active);
    const cards = [other, active, other, active].map(p => addTestCard(bears, p, p.hand));
    const moves = cards.map(card => new GameEvent_ChangeCardZone(card, card.owner.battlefield));
    const observed = vi.fn();
    gameEventManager.rules.on(RulesEventType.ZoneChanged, observed);
    gameEventManager.performSimultaneous(moves);
    expect(game.pendingResolutionChoice.player).toBe(active);
    game.pendingResolutionChoice.submit(other, [cards[3]]);
    game.pendingResolutionChoice.submit(active, [cards[0]]);
    expect(game.pendingResolutionChoice.player).toBe(active);
    game.pendingResolutionChoice.submit(active, [cards[3]]);
    expect(game.pendingResolutionChoice.player).toBe(other);
    expect(observed).not.toHaveBeenCalled();
    game.pendingResolutionChoice.submit(other, [cards[2]]);
    const timestamps = [3, 1, 2, 0].map(i => moves[i].newObject.timestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(timestamps).size).toBe(4);
    expect(observed).toHaveBeenCalledTimes(4);
});

test("the owner orders simultaneous graveyard timestamps even for creatures with no abilities", () => {
    const first = addTestCard(bears, player, player.battlefield);
    const second = addTestCard(bears, player, player.battlefield);
    const moves = [first, second].map(card => new GameEvent_ChangeCardZone(card, player.graveyard));
    gameEventManager.performSimultaneous(moves);
    expect(game.pendingResolutionChoice?.player).toBe(player);
    expect(player.graveyard.objects).toHaveLength(0);
    game.pendingResolutionChoice.submit(player, [second]);
    expect(player.graveyard.objects).toHaveLength(2);
    expect(moves[1].newObject.timestamp).toBeLessThan(moves[0].newObject.timestamp);
    expect(game.hasPendingResolutionChoice).toBe(false);
});

test("timestamp choices for cards moving out of a library keep their identities hidden", () => {
    const first = addTestCard(bears, player, player.library);
    const second = addTestCard(cardData.find(def => def.name === "Forest"), player, player.library);
    const moves = [first, second].map(card => new GameEvent_ChangeCardZone(card, player.hand));
    gameEventManager.performSimultaneous(moves);
    const choice = game.pendingResolutionChoice;
    expect(choice.visibility).toBe(CardChoiceVisibility.Private);
    if (choice.presentation !== CardChoicePresentation.SingleCardList) throw new Error("Expected a card list");
    expect(choice.options.map(choice.optionName)).toEqual(["Card 2 from the top", "Card 1 from the top"]);
    choice.submit(player, [second]);
    expect(moves[1].newObject.timestamp).toBeLessThan(moves[0].newObject.timestamp);
});

test("losing an ability removes every instance and later grants use timestamp order", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const flight = { keyword: Keyword.Flying, parts: {} };
    const first = target.grantAbility(flight, target);
    const second = target.grantAbility(flight, target);
    const stopLoss = layers.register({ select: () => [target],
        changes: [removeAbilities(ability => ability.def.keyword === Keyword.Flying)] });
    expect(target.abilities).toEqual([]);
    const third = target.grantAbility(flight, target);
    expect(target.abilities).toEqual([third.ability]);
    stopLoss();
    expect(target.abilities).toEqual([first.ability, second.ability, third.ability]);
});

test("a prohibition prevents later flight grants and leaves other parts of the resolved effect active", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const other = addTestCard(bears, opponent, opponent.battlefield);
    const prohibit = layers.register({ select: () => [target],
        changes: [removeAbilities(ability => ability.def.keyword === Keyword.Flying, AbilityRemoval.CannotHave)] });
    const flight = { keyword: Keyword.Flying, parts: {} };
    const grant = abilityGrant(flight, other, () => other.timestamp);
    const end = layers.registerResolved({ select: () => [target, other], changes: [grant.change, statModifier(1, 2)] });
    const liveGrant = abilityGrant(flight, target, () => target.timestamp);
    staticAbility(other, { select: () => [target], changes: [liveGrant.change] });
    expect(target.hasKeyword(Keyword.Flying)).toBe(false);
    expect(other.hasKeyword(Keyword.Flying)).toBe(true);
    expect(target.getPowerToughness()).toEqual({ power: 3, toughness: 4 });
    prohibit();
    expect(target.abilities).toEqual([liveGrant.forObject(target)]);
    end();
    expect(target.power).toBe(2);
    expect(other.hasKeyword(Keyword.Flying)).toBe(false);
});

test("resolved effects keep their original recipients across colour changes and exclude returning objects", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const end = layers.registerResolved({ select: () => player.battlefield.objects.filter(card => card.colours.has("G")),
        changes: [statModifier(2, 1)] });
    target.colours = new Set(["R"]);
    expect(target.power).toBe(4);
    const late = addTestCard(bears, player, player.battlefield);
    expect(late.power).toBe(2);
    const returned = moveTestCard(moveTestCard(target, player.hand), player.battlefield);
    expect(returned.power).toBe(2);
    expect(target.power).toBe(4);
    end();
    expect(target.power).toBe(4);
});

test("resolved control and ability effects follow a spell through resolution and can expire independently", () => {
    const card = addTestCard(bears, player, player.hand);
    expect(game.stack.spellCast(player, card)).toBe(true);
    const spell = game.stack.objects[0] as Spell;
    const endControl = layers.registerResolved({ select: () => [spell], changes: [change(Layer.Control,
        () => [opponent] as const, (state, controller) => { state.controller = controller; })] });
    const flight = abilityGrant({ keyword: Keyword.Flying, parts: {} }, spell, () => spell.timestamp);
    const endFlight = layers.registerResolved({ select: () => [spell], changes: [flight.change] });
    game.stack.resolveAll();
    const [creature] = opponent.battlefield.objects;
    expect(creature.controller).toBe(opponent);
    expect(creature.hasKeyword(Keyword.Flying)).toBe(true);
    expect(creature.abilities[0].source).toBe(creature);
    endControl();
    expect(creature.zone).toBe(player.battlefield);
    expect(creature.controller).toBe(player);
    expect(creature.hasKeyword(Keyword.Flying)).toBe(true);
    endFlight();
    expect(creature.abilities).toEqual([]);
});

test.each([true, false])("a simultaneous sacrifice and loss of control use pre-batch characteristics (Aura first %s)", auraFirst => {
    const target = addTestCard(bears, player, player.battlefield);
    const auraCard = addTestCard(cardData.find(def => def.name === "Control Magic"), opponent, opponent.hand);
    expect(game.stack.spellCast(opponent, auraCard, [target])).toBe(true);
    game.stack.resolveAll();
    const aura = opponent.battlefield.objects.find(object => object.card === auraCard.card);
    const sacrifice = new GameEvent_SacrificePermanent(opponent, target);
    const destroy = new GameEvent_DestroyPermanent(aura);
    gameEventManager.performSimultaneous(auraFirst ? [destroy, sacrifice] : [sacrifice, destroy]);
    expect(sacrifice.newObject?.zone).toBe(player.graveyard);
    expect(target.controller).toBe(opponent);
    expect(destroy.newObject?.zone).toBe(opponent.graveyard);
});

test("control observers see the final controller and partition of every affected permanent", () => {
    const targets = [0, 1].map(() => addTestCard(bears, player, player.battlefield));
    const observed = vi.fn(() => {
        for (const object of targets) {
            expect(object.zone).toBe(opponent.battlefield);
            expect(object.controller).toBe(opponent);
        }
    });
    targets[0].onControlOrAttachmentChanged(observed);
    layers.registerResolved({ select: () => targets, changes: [change(Layer.Control,
        () => [opponent] as const, (state, controller) => { state.controller = controller; })] });
    expect(observed).toHaveBeenCalledOnce();
});

test("a grant that began in layer 4 retains its listener and identity when its source loses all abilities in layer 6", () => {
    const target = addTestCard(bears, player, player.battlefield);
    const source = addTestCard({ ...bears, abilities: [{ parts: {
        AbilityPart_SelectObjectsContinuously: { target: "CHOSEN", saveAs: "RECIPIENT" },
        AbilityPart_GrantAbilityContinuously: { permanentsFrom: "RECIPIENT", grant: { keyword: Keyword.Flying } },
    } }] }, player, player.battlefield);
    const original = source.abilities[0];
    // Configure the additional layer-4 component before installing a fresh ability.
    const ability = makeAbility(original.originalDefinition, source);
    class AddArtifact extends AbilityPart {
        layerEffect() {
            return { selectionKey: "RECIPIENT", select: () => [target],
                changes: [change(Layer.Type, () => [] as const, state => { state.types = [...state.types, CardType.Artifact]; })] };
        }
    }
    ability.addPart(new AddArtifact());
    ability.slate.CHOSEN = [target];
    source.abilities = [ability];
    const [first] = target.abilities;
    expect(first.def.keyword).toBe(Keyword.Flying);
    const setup = vi.spyOn(first, "setup");
    const cleanup = vi.spyOn(first, "cleanup");
    const stop = layers.register({ select: () => [source], changes: [removeAbilities(() => true)] });
    expect(source.abilities).toEqual([]);
    expect(target.hasType(CardType.Artifact)).toBe(true);
    expect(target.abilities[0]).toBe(first);
    expect(cleanup).not.toHaveBeenCalled();
    stop();
    expect(target.abilities[0]).toBe(first);
    expect(setup).not.toHaveBeenCalled();
    moveTestCard(source, player.graveyard);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(target.abilities).toEqual([]);
});

test("reattaching an Aura renews its static effect's timestamp across the battlefield", () => {
    const artifactDef = cardData.find(def => def.name === "Celestial Prism");
    const [one, two] = [0, 1].map(() => addTestCard(artifactDef, player, player.battlefield));
    const auraCard = addTestCard(cardData.find(def => def.name === "Animate Artifact"), player, player.hand);
    game.stack.spellCast(player, auraCard, [one]);
    game.stack.resolveAll();
    const aura = player.battlefield.objects.find(object => object.card === auraCard.card);
    const set = layers.registerResolved({ select: () => [one, two], changes: [setPT(9, 9)] });
    expect(one.power).toBe(9);
    const before = aura.timestamp;
    expect(gameEventManager.performImmediate(new GameEvent_AttachPermanent(aura, one))).toBe(false);
    expect(aura.timestamp).toBe(before);
    expect(gameEventManager.performImmediate(new GameEvent_AttachPermanent(aura, two))).toBe(true);
    expect(aura.timestamp).toBeGreaterThan(before);
    expect(two.power).toBe(3);
    set();
    expect(one.hasType(CardType.Creature)).toBe(false);
    expect(two.hasType(CardType.Creature)).toBe(true);
});

test("land-type changes update intrinsic mana abilities while determining same-layer dependencies", () => {
    const forest = addTestCard(cardData.find(def => def.name === "Forest"), player, player.battlefield);
    const source = addTestCard(bears, opponent, opponent.battlefield);
    staticAbility(source, {
        select: () => forest.abilities.some(ability => ability.getPotentialMana()[ManaColour.R] > 0) ? [forest] : [],
        changes: [change(Layer.Type, () => [] as const, state => { state.types = [...state.types, CardType.Artifact]; })],
    });
    const converter = addTestCard(landEffect(BasicLandType.Forest, BasicLandType.Mountain), player, player.battlefield);
    expect(forest.hasType(CardType.Artifact)).toBe(true);
    expect(forest.abilities).toHaveLength(1);
    expect(forest.abilities[0].getPotentialMana()[ManaColour.R]).toBe(1);
    moveTestCard(converter, player.graveyard);
    expect(forest.hasType(CardType.Artifact)).toBe(false);
    expect(forest.abilities).toHaveLength(1);
    expect(forest.abilities[0].getPotentialMana()[ManaColour.G]).toBe(1);
});
