import playerActionManager from "@engine/actions/PlayerActionManager";
import { PlayerActions } from "@engine/actions";
import { type CardObject,type Permanent,StackAbility } from "@engine/GameObject";
import type { Zone } from "@engine/Zone";
import { CombatManager } from "@engine/CombatManager";
import { CardChoiceVisibility,GameEvent_Advance,GameEvent_CastSpell,GameEvent_ChangeCardZone,GameEvent_DealDamage,GameEvent_DeclareAttacker,GameEvent_GoToNextTurn,GameEvent_GoToStep,GameEvent_TapCard,GameEvent_UntapCard } from "@engine/events";
import { GameEvent_AttachPermanent } from "@engine/events/GameEvent_AttachPermanent";
import { GameEvent_SacrificePermanent } from "@engine/events/GameEvent_ChangeCardZone";
import { GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import gameEventManager from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { ManaColour } from "@engine/mana";
import Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,ANCESTRAL_RECALL,BASIC_DECK,FOREST,GRIZZLY_BEARS,MONS_GOBLIN_RAIDERS,moveTestCard,passPriorityRound,startMainPhase } from "@engine/tests/testData";
import { CardType,Keyword } from "~/defs";
import { cardData } from "~/index";

test("Circle of Protection: Red prevents one hit from the chosen source to its controller", () => {
    Game.init();
    const caster = game.addPlayer([]);
    const opponent = game.addPlayer([]);
    startMainPhase();

    const def = cardData.find(card => card.name === "Circle of Protection: Red");
    expect(def).toMatchObject({ type: CardType.Enchantment, cost: "{1}{W}" });
    const plains = cardData.find(card => card.name === "Plains");
    const castingLands = [addTestCard(plains, caster, caster.battlefield), addTestCard(plains, caster, caster.battlefield)];
    const card = addTestCard(def, caster, caster.hand);
    const [cast] = playerActionManager.getCardActions(card, caster);
    cast.perform(caster);
    passPriorityRound();
    expect(castingLands.every(land => land.tapped)).toBe(true);
    const circle = caster.battlefield.objects.find(object => object.card === card.card);
    expect(playerActionManager.getCardActions(circle, caster)).toEqual([]);

    const land = addTestCard(plains, caster, caster.battlefield);
    const chosen = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
    const other = addTestCard(cardData[MONS_GOBLIN_RAIDERS], opponent, opponent.battlefield);
    const wrongColour = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    const [activate] = playerActionManager.getCardActions(circle, caster);
    activate.perform(caster);
    expect(land.tapped).toBe(true);
    expect(game.stack.objects.at(-1)).toBeInstanceOf(StackAbility);
    expect(game.pendingResolutionChoice).toBeNull();
    expect(game.pendingTargeter).toBeNull();
    gameEventManager.addEvent(new GameEvent_DealDamage(chosen, caster, 1));
    expect(caster.life).toBe(19);

    passPriorityRound();
    const choice = game.pendingResolutionChoice;
    expect(choice.player).toBe(caster);
    expect(choice.options).toEqual([chosen, other]);
    choice.submit(opponent, [chosen]);
    choice.submit(caster, [wrongColour]);
    expect(game.pendingResolutionChoice).toBe(choice);
    choice.submit(caster, [chosen]);
    expect(game.pendingResolutionChoice).toBeNull();
    expect(game.stack.objects).toHaveLength(0);

    gameEventManager.addEvents([
        new GameEvent_DealDamage(chosen, opponent, 3),
        new GameEvent_DealDamage(other, caster, 1),
        new GameEvent_DealDamage(chosen, caster, 4),
    ]);
    expect(opponent.life).toBe(17);
    expect(caster.life).toBe(18);
    gameEventManager.addEvent(new GameEvent_DealDamage(chosen, caster, 4));
    expect(caster.life).toBe(14);
});

describe("Consecrate Land", () => {
    const consecrateLand = cardData.find(card => card.name === "Consecrate Land");
    const plains = cardData.find(card => card.name === "Plains");
    let caster: Player;
    let opponent: Player;
    let land: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        land = addTestCard(cardData[FOREST], opponent, opponent.battlefield);
    });

    test("enchants an opponent's land for one white mana and protects it from Armageddon", () => {
        startMainPhase();
        const manaSource = addTestCard(plains, caster, caster.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const aura = addTestCard(consecrateLand, caster, caster.hand);
        const [cast] = playerActionManager.getCardActions(aura, caster);
        cast.perform(caster);
        expect(game.pendingTargeter.validateTargets([creature])).toBe(false);
        game.pendingTargeter.onTargeted([land]);
        passPriorityRound();

        const attached = caster.battlefield.objects.find(object => object.card === aura.card);
        expect(manaSource.tapped).toBe(true);
        expect(attached?.attachedTo).toBe(land);
        expect(land.hasKeyword(Keyword.Indestructible)).toBe(true);

        const armageddon = addTestCard(cardData.find(card => card.name === "Armageddon"), caster, caster.hand);
        expect(game.stack.spellCast(caster, armageddon)).toBe(true);
        game.stack.resolveAll();

        expect(caster.graveyard.objects.map(object => object.card)).toContain(manaSource.card);
        expect(land.zone).toBe(opponent.battlefield);
        expect(attached.attachedTo).toBe(land);

        gameEventManager.addEvent(new GameEvent_SacrificePermanent(opponent, land));
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([land.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(aura.card);
    });

    test("makes other Auras illegal until it leaves the battlefield", () => {
        const otherAura = { ...consecrateLand, name: "Test land Aura", abilities: [{ parts: {
            SimpleAura: { targetValidator: { cardType: CardType.Land } },
        } }] };
        const firstAura = addTestCard(otherAura, opponent, opponent.hand);
        expect(game.stack.spellCast(opponent, firstAura, [land])).toBe(true);
        game.stack.resolveAll();

        const aura = addTestCard(consecrateLand, caster, caster.hand);
        expect(game.stack.spellCast(caster, aura, [land])).toBe(true);
        game.stack.resolveAll();

        const attached = caster.battlefield.objects.find(object => object.card === aura.card);
        expect(attached?.attachedTo).toBe(land);
        expect(opponent.graveyard.objects.map(object => object.card)).toEqual([firstAura.card]);
        const nextAura = addTestCard(otherAura, opponent, opponent.hand);
        const secondConsecrate = addTestCard(consecrateLand, caster, caster.hand);
        expect(game.stack.spellCast(caster, secondConsecrate, [land])).toBe(false);
        expect(game.stack.spellCast(opponent, nextAura, [land])).toBe(false);

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(nextAura, opponent.battlefield, { attachedTo: land }));
        expect(nextAura.zone).toBe(opponent.hand);

        moveTestCard(attached, caster.graveyard);
        expect(land.hasKeyword(Keyword.Indestructible)).toBe(false);
        expect(game.stack.spellCast(opponent, nextAura, [land])).toBe(true);
        game.stack.resolveAll();
        expect(opponent.battlefield.objects.find(object => object.card === nextAura.card)?.attachedTo).toBe(land);
    });
});

describe("Ancestral Recall", () => {
    let caster: Player;
    let opponent: Player;
    let island: Permanent;
    let recall: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        island = addTestCard(cardData.find(card => card.name === "Island"), caster, caster.battlefield);
        recall = addTestCard(cardData[ANCESTRAL_RECALL], caster, caster.hand);
    });

    function beginCasting() {
        const [action] = playerActionManager.getCardActions(recall, caster);
        action.perform(caster);
        expect(game.pendingTargeter?.source).toBe(recall);
        return game.pendingTargeter;
    }

    test.each(["caster", "opponent"])("only the chosen %s draws three cards", recipient => {
        const target = recipient === "caster" ? caster : opponent;
        const resolveSpell = vi.spyOn(game.stack, "resolveSpell");
        const request = beginCasting();

        expect(island.tapped).toBe(false);
        expect(recall.zone).toBe(caster.hand);
        expect(game.stack.objects).toHaveLength(0);
        expect(resolveSpell).not.toHaveBeenCalled();

        request.onTargeted([target]);
        request.onTargeted([target]);
        passPriorityRound();

        expect(resolveSpell).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ card: recall.card, targets: [target] }));
        expect(game.pendingTargeter).toBeNull();
        expect(island.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(recall.card);
        expect(caster.hand.objects).toHaveLength(target === caster ? 10 : 7);
        expect(opponent.hand.objects).toHaveLength(target === opponent ? 10 : 7);
    });

    test("each draw uses the top of the library after the previous draw's follow-ups", () => {
        const next = addTestCard(cardData[FOREST], opponent, opponent.library);
        const first = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.library);
        const inserted = addTestCard(cardData[FOREST], opponent, opponent.hand);
        const drawn: CardObject["card"][] = [];
        const afterDraw = (event: GameEvent_ChangeCardZone) => {
            if (event.oldZone !== opponent.library || event.newZone !== opponent.hand)
                return;

            drawn.push(event.oldObject.card);
            if (event.oldObject === first) {
                gameEventManager.onResolved(() => {
                    gameEventManager.addEvent(new GameEvent_ChangeCardZone(inserted, opponent.library));
                });
            }
        };
        gameEventManager.onPerformed(GameEventType.ChangeCardZone, afterDraw);
        try {
            beginCasting().onTargeted([opponent]);
            passPriorityRound();
        } finally {
            gameEventManager.offPerformed(GameEventType.ChangeCardZone, afterDraw);
        }

        expect(drawn).toEqual([first.card, inserted.card, next.card]);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(recall.card);
    });

    test("rejects a missing target, a card, and a player outside the game", () => {
        gameEventManager.addEvent(new GameEvent_CastSpell(caster, recall));
        expect(recall.zone).toBe(caster.hand);

        const request = beginCasting();
        request.onTargeted([]);
        request.onTargeted([island]);
        request.onTargeted([new Player(2, [])]);

        expect(game.pendingTargeter).toBe(request);
        expect(island.tapped).toBe(false);
        expect(recall.zone).toBe(caster.hand);
        request.onTargeted([opponent]);
        passPriorityRound();
        expect(opponent.hand.objects).toHaveLength(10);
    });

    test("cancelling preserves the spell and mana and allows another attempt", () => {
        caster.manaPool[ManaColour.U] = 1;
        const request = beginCasting();

        request.onCancelled();
        request.onTargeted([opponent]);

        expect(game.pendingTargeter).toBeNull();
        expect(recall.zone).toBe(caster.hand);
        expect(island.tapped).toBe(false);
        expect(caster.manaPool[ManaColour.U]).toBe(1);
        expect(opponent.hand.objects).toHaveLength(7);

        beginCasting().onTargeted([opponent]);
        passPriorityRound();
        expect(caster.graveyard.objects.map(object => object.card)).toContain(recall.card);
        expect(caster.manaPool[ManaColour.U]).toBe(0);
        expect(opponent.hand.objects).toHaveLength(10);
    });
});

describe("Animate Wall", () => {
    let caster: Player;
    let opponent: Player;
    let aura: CardObject;
    let plains: Permanent;

    function cardByName<T extends CardObject>(name: string, owner: Player, zone: Zone<T>) {
        return addTestCard(cardData.find(card => card.name === name), owner, zone);
    }

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        plains = cardByName("Plains", caster, caster.battlefield);
        aura = cardByName("Animate Wall", caster, caster.hand);
    });

    function beginCasting() {
        const [action] = playerActionManager.getCardActions(aura, caster);
        action.perform(caster);
        expect(game.pendingTargeter?.source).toBe(aura);
        return game.pendingTargeter;
    }

    test.each(["caster", "opponent"])("lets the %s's enchanted Wall attack with defender", recipient => {
        const controller = recipient === "caster" ? caster : opponent;
        const wall = cardByName("Wall of Swords", controller, controller.battlefield);
        const otherWall = cardByName("Wall of Swords", controller, controller.battlefield);
        const declaration = new GameEvent_DeclareAttacker(wall);
        expect(gameEventManager.checkEvent(declaration)).toBe(false);

        const request = beginCasting();
        expect(plains.tapped).toBe(false);
        request.onTargeted([wall]);
        passPriorityRound();
        expect(plains.tapped).toBe(true);
        const attached = caster.battlefield.objects.find(object => object.card === aura.card);
        expect(attached?.attachedTo).toBe(wall);
        expect(wall.hasKeyword(Keyword.Defender)).toBe(true);

        if (controller === opponent)
            gameEventManager.addEvent(new GameEvent_GoToNextTurn());
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        expect(CombatManager.canAttack(otherWall)).toBe(false);
        expect(wall.tapped).toBe(false);
        const [attack] = playerActionManager.getCardActions(wall, controller);
        attack.perform(controller);
        expect(CombatManager.attackingCreatures.has(wall)).toBe(true);

        gameEventManager.addEvent(new GameEvent_ChangeCardZone(attached, caster.graveyard));
        expect(CombatManager.canAttack(wall)).toBe(false);
    });

    test("requires a Wall on the battlefield before offering or completing the cast", () => {
        const wall = cardByName("Wall of Swords", opponent, opponent.hand);
        const otherCreature = cardByName("Grizzly Bears", opponent, opponent.battlefield);
        expect(playerActionManager.getCardActions(aura, caster)).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_CastSpell(caster, aura));
        expect(aura.zone).toBe(caster.hand);

        const legalWall = cardByName("Wall of Swords", caster, caster.battlefield);
        const request = beginCasting();
        request.onTargeted([otherCreature]);
        request.onTargeted([plains]);
        request.onTargeted([wall]);
        request.onTargeted([opponent]);

        expect(game.pendingTargeter).toBe(request);
        expect(plains.tapped).toBe(false);
        expect(aura.zone).toBe(caster.hand);
        request.onTargeted([legalWall]);
        passPriorityRound();
        expect(caster.battlefield.objects.find(object => object.card === aura.card)?.attachedTo).toBe(legalWall);
    });
});

describe.each([
    { name: "Black Ward", colour: "B", otherColour: "U" },
    { name: "Blue Ward", colour: "U", otherColour: "B" },
    { name: "Green Ward", colour: "G", otherColour: "R" },
    { name: "Red Ward", colour: "R", otherColour: "G" },
    { name: "White Ward", colour: "W", otherColour: "B" },
] as const)("$name", ({ name, colour, otherColour }) => {
    const wardDef = cardData.find(card => card.name === name);
    const protection = { parts: { AbilityPart_Protection: { colour } } };
    let caster: Player;
    let opponent: Player;
    let ward: CardObject;
    let plains: Permanent;
    let creature: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));

        ward = addTestCard(wardDef, caster, caster.hand);
        plains = addTestCard(cardData.find(card => card.name === "Plains"), caster, caster.battlefield);
        creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
    });

    function castWard(): Permanent {
        expect(game.stack.spellCast(caster, ward, [creature])).toBe(true);
        game.stack.resolveAll();
        return caster.battlefield.objects.find(object => object.card === ward.card);
    }

    test("pays white mana to enchant a creature and grants protection while attached", () => {
        const [action] = playerActionManager.getCardActions(ward, caster);
        action.perform(caster);
        const request = game.pendingTargeter;
        expect(request?.source).toBe(ward);
        request.onTargeted([plains]);
        expect(game.pendingTargeter).toBe(request);
        expect(plains.tapped).toBe(false);

        request.onTargeted([creature]);
        passPriorityRound();
        expect(game.pendingTargeter).toBeNull();
        expect(plains.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        const attachedWard = caster.battlefield.objects.find(object => object.card === ward.card);
        expect(attachedWard?.attachedTo).toBe(creature);
        expect(creature.abilities).toEqual([expect.objectContaining({ source: creature, grantedBy: attachedWard })]);

        const source = addTestCard({ ...cardData[GRIZZLY_BEARS], cost: `{${colour}}` }, opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
        expect(creature.damageTaken).toBe(0);

        const otherSource = addTestCard({ ...cardData[GRIZZLY_BEARS], cost: `{${otherColour}}` }, opponent, opponent.battlefield);
        expect(gameEventManager.checkEvent(new GameEvent_DealDamage(otherSource, creature, 1))).toBe(true);

        moveTestCard(attachedWard, caster.graveyard);
        expect(creature.abilities).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_DealDamage(source, creature, 1));
        expect(creature.damageTaken).toBe(1);
    });

    test("the grant follows reattachment and ends on detach or loss of the granting ability", () => {
        const attachedWard = castWard();
        const otherCreature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const [initialGrant] = creature.abilities;

        attachedWard.attachedTo = otherCreature;
        expect(creature.abilities).toHaveLength(0);
        expect(otherCreature.abilities).toEqual([expect.objectContaining({ source: otherCreature, grantedBy: attachedWard })]);
        expect(otherCreature.abilities).not.toContain(initialGrant);
        attachedWard.colours = new Set(["W", colour]);
        game.checkState();
        expect(attachedWard.zone).toBe(caster.battlefield);

        attachedWard.attachedTo = undefined;
        expect(otherCreature.abilities).toHaveLength(0);
        attachedWard.attachedTo = otherCreature;
        expect(otherCreature.abilities).toHaveLength(1);

        attachedWard.abilities = attachedWard.abilities.slice(0, 1);
        expect(attachedWard.attachedTo).toBe(otherCreature);
        expect(otherCreature.abilities).toHaveLength(0);
    });

    test("its own protection keeps it attached until an independent grant applies", () => {
        const firstWard = castWard();
        firstWard.colours = new Set(["W", colour]);
        game.checkState();
        expect(firstWard.attachedTo).toBe(creature);
        expect(firstWard.zone).toBe(caster.battlefield);

        const secondWard = addTestCard(wardDef, caster, caster.hand);
        expect(secondWard.spellTargeter.validateTargets([creature])).toBe(colour !== "W");

        const { ability: independentGrant } = creature.grantAbility(protection, plains);
        game.checkState();
        expect(caster.graveyard.objects).toContainEqual(expect.objectContaining({ card: firstWard.card }));
        expect(creature.abilities).toEqual([independentGrant]);
    });

    test("a separate protection grant from the same Aura can remove it", () => {
        // 702.16n: Start colourless so both grants can apply before the Aura gains the protected colour.
        ward = addTestCard({
            ...wardDef,
            cost: "{1}",
            abilities: [...wardDef.abilities, { parts: {
                AbilityPart_GrantAttachedAbility: {
                    grant: protection,
                },
            } }],
        }, caster, caster.hand);
        const attachedWard = castWard();
        expect(creature.abilities).toHaveLength(2);

        attachedWard.colours = new Set([colour]);
        game.checkState();

        expect(caster.graveyard.objects).toContainEqual(expect.objectContaining({ card: ward.card }));
        expect(creature.abilities).toHaveLength(0);
    });
});

describe("Castle", () => {
    const castleDef = cardData.find(card => card.name === "Castle");
    let caster: Player;
    let opponent: Player;
    let creature: Permanent;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        creature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
    });

    test("gives only its controller's untapped creatures +0/+2 after it resolves", () => {
        const castle = addTestCard(castleDef, caster, caster.hand);
        const plains = addTestCard(cardData.find(card => card.name === "Plains"), caster, caster.battlefield);
        const forests = Array.from({ length: 3 }, () => addTestCard(cardData[FOREST], caster, caster.battlefield));
        const opposingCreature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        const tappedCreature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        gameEventManager.addEvent(new GameEvent_TapCard(tappedCreature));

        const [cast] = playerActionManager.getCardActions(castle, caster);
        cast.perform(caster);
        expect(creature.toughness).toBe(2);
        passPriorityRound();

        expect([plains, ...forests].every(land => land.tapped)).toBe(true);
        expect(creature.power).toBe(2);
        expect(creature.toughness).toBe(4);
        expect(opposingCreature.toughness).toBe(2);
        expect(tappedCreature.toughness).toBe(2);
        expect(game.pendingTargeter).toBeNull();
    });

    test("applies as creatures enter and updates when they tap and untap", () => {
        const castle = addTestCard(castleDef, caster, caster.battlefield);
        gameEventManager.addEvent(new GameEvent_TapCard(castle));

        const card = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.hand);
        const entry = new GameEvent_ChangeCardZone(card, caster.battlefield, { controller: caster });
        gameEventManager.addEvent(entry);
        const newCreature = caster.battlefield.objects.find(object => object === entry.newObject);
        expect(newCreature.toughness).toBe(4);

        gameEventManager.addEvent(new GameEvent_TapCard(newCreature));
        expect(newCreature.toughness).toBe(2);
        gameEventManager.addEvent(new GameEvent_UntapCard(newCreature));
        expect(newCreature.toughness).toBe(4);
    });

    test("each Castle contributes its bonus and losing it can make existing damage lethal", () => {
        const first = addTestCard(castleDef, caster, caster.battlefield);
        const second = addTestCard(castleDef, caster, caster.battlefield);
        expect(creature.toughness).toBe(6);

        const attacker = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        gameEventManager.addEvent(new GameEvent_DealDamage(attacker, creature, 3));
        moveTestCard(first, caster.graveyard);
        expect(creature.toughness).toBe(4);

        moveTestCard(second, caster.graveyard);
        expect(caster.graveyard.objects.map(object => object.card)).toContain(creature.card);
    });
});

describe("Armageddon", () => {
    let caster: Player;
    let opponent: Player;
    let armageddon: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
        armageddon = addTestCard(cardData.find(card => card.name === "Armageddon"), caster, caster.hand);
    });

    test("destroys every land on the battlefield simultaneously", () => {
        const forest = cardData[FOREST];
        const casterLands = [
            addTestCard(cardData.find(card => card.name === "Plains"), caster, caster.battlefield),
            ...Array.from({ length: 3 }, () => addTestCard(forest, caster, caster.battlefield)),
        ];
        const nonbasic = addTestCard({ ...forest, name: "Nonbasic land", subtypes: [], abilities: [] },
            opponent, opponent.battlefield);
        const creature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);
        const landInHand = addTestCard(forest, opponent, opponent.hand);
        const landInLibrary = addTestCard(forest, opponent, opponent.library);

        const onDestroy = vi.fn(() => {
            expect(caster.battlefield.objects).toEqual([creature]);
            expect(opponent.battlefield.objects).toHaveLength(0);
            expect(new Set(caster.graveyard.objects.map(object => object.card))).toEqual(new Set(casterLands.map(land => land.card)));
            expect(opponent.graveyard.objects.map(object => object.card)).toEqual([nonbasic.card]);
            expect(game.stack.objects[0]).toMatchObject({ card: armageddon.card, targets: [] });
        });
        gameEventManager.onPerformed(GameEventType.DestroyPermanent, onDestroy);
        try {
            const [action] = playerActionManager.getCardActions(armageddon, caster);
            action.perform(caster);
            passPriorityRound();

            expect(onDestroy).toHaveBeenCalledTimes(casterLands.length + 1);
            expect(game.pendingTargeter).toBeNull();
            expect(game.stack.objects).toHaveLength(0);
            expect(caster.graveyard.objects.at(-1)?.card).toBe(armageddon.card);
            expect(caster.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
            expect(landInHand.zone).toBe(opponent.hand);
            expect(landInLibrary.zone).toBe(opponent.library);
        } finally {
            gameEventManager.offPerformed(GameEventType.DestroyPermanent, onDestroy);
        }
    });

    test("can be cast and resolved with no lands on the battlefield", () => {
        caster.manaPool[ManaColour.W] = 4;
        const [action] = playerActionManager.getCardActions(armageddon, caster);
        action.perform(caster);
        passPriorityRound();

        expect(game.pendingTargeter).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([armageddon.card]);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
    });
});

describe("Balance", () => {
    let caster: Player;
    let opponent: Player;
    let balance: CardObject;

    function addCard<T extends CardObject>(name: string, owner: Player, zone: Zone<T>): T {
        return addTestCard(cardData.find(card => card.name === name), owner, zone);
    }

    function cast() {
        const [action] = playerActionManager.getCardActions(balance, caster);
        expect(action).toBeDefined();
        action.perform(caster);
        passPriorityRound();
    }

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer([]);
        opponent = game.addPlayer([]);
        game.startGame();
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Main));
        balance = addCard("Balance", caster, caster.hand);
    });

    test("pays {1}{W}, then chooses lands, discards cards, and chooses creatures", () => {
        const plains = addCard("Plains", caster, caster.battlefield);
        const forest = addCard("Forest", caster, caster.battlefield);
        const mountain = addCard("Mountain", opponent, opponent.battlefield);
        const keepInHand = addCard("Plains", caster, caster.hand);
        const discard = [addCard("Air Elemental", caster, caster.hand), addCard("Forest", caster, caster.hand)];
        const opponentHand = addCard("Forest", opponent, opponent.hand);
        const bears = addCard("Grizzly Bears", caster, caster.battlefield);
        const wall = addCard("Wall of Swords", opponent, opponent.battlefield);
        const goblins = addCard("Mons's Goblin Raiders", opponent, opponent.battlefield);
        const cardInLibrary = addCard("Forest", opponent, opponent.library);

        cast();

        const spell = game.stack.objects[0];
        expect(spell).toMatchObject({ card: balance.card, targets: [] });
        expect(game.pendingTargeter).toBeNull();
        expect([plains.tapped, forest.tapped]).toEqual([true, true]);
        expect(caster.manaPool).toEqual([0, 0, 0, 0, 0, 0]);
        expect(game.pendingResolutionChoice).toMatchObject({ player: caster, count: 1, options: [plains, forest] });
        game.pendingResolutionChoice.submit(caster, [plains]);

        expect(game.stack.objects).toEqual([spell]);
        expect(caster.battlefield.objects).toEqual([plains, bears]);
        expect(game.pendingResolutionChoice).toMatchObject({ player: caster, count: 2, visibility: CardChoiceVisibility.Private });
        game.pendingResolutionChoice.submit(caster, discard);

        expect(game.stack.objects).toEqual([spell]);
        expect(caster.hand.objects).toEqual([keepInHand]);
        expect(game.pendingResolutionChoice).toMatchObject({ player: opponent, count: 1, options: [wall, goblins] });
        game.pendingResolutionChoice.submit(opponent, [wall]);

        expect(game.pendingResolutionChoice).toBeNull();
        expect(game.stack.objects).toHaveLength(0);
        expect(caster.graveyard.objects.map(card => card.card)).toEqual([forest.card, ...discard.map(card => card.card), balance.card]);
        expect(opponent.graveyard.objects.map(card => card.card)).toEqual([goblins.card]);
        expect(opponent.battlefield.objects).toEqual([mountain, wall]);
        expect(opponent.hand.objects).toEqual([opponentHand]);
        expect(opponent.library.objects).toEqual([cardInLibrary]);
    });

    test("counts later phases after earlier batches and their follow-ups", () => {
        caster.manaPool[ManaColour.W] = 2;
        const land = addCard("Forest", caster, caster.battlefield);
        const extraHandCard = addCard("Forest", caster, caster.library);
        const kept = addCard("Plains", caster, caster.hand);
        addCard("Plains", opponent, opponent.hand);
        const bears = addCard("Grizzly Bears", caster, caster.battlefield);
        const opponentBears = addCard("Grizzly Bears", opponent, opponent.battlefield);
        const afterLand = (event: GameEvent_ChangeCardZone) => {
            if (event.oldObject !== land)
                return;

            const followUp = new GameEvent_Log(GameEventType.Log, "Move a card to hand after the land sacrifice");
            followUp.then(() => gameEventManager.onResolved(() => {
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(extraHandCard, caster.hand));
            }));
            gameEventManager.addEvent(followUp);
        };
        const afterDiscard = () => gameEventManager.addEvent(new GameEvent_ChangeCardZone(opponentBears, opponent.graveyard));
        gameEventManager.onPerformed(GameEventType.SacrificePermanent, afterLand);
        gameEventManager.onPerformed(GameEventType.DiscardCard, afterDiscard);
        try {
            cast();
            expect(land.retired).toBe(true);
            const drawn = caster.hand.objects.find(card => card.card === extraHandCard.card);
            expect(game.pendingResolutionChoice).toMatchObject({ player: caster, count: 1, options: [kept, drawn] });
            game.pendingResolutionChoice.submit(caster, [drawn]);

            expect(game.pendingResolutionChoice).toBeNull();
            expect(opponent.battlefield.objects).toHaveLength(0);
            expect(caster.battlefield.objects).toHaveLength(0);
            expect(caster.graveyard.objects.map(card => card.card)).toEqual([land.card, drawn.card, bears.card, balance.card]);
        } finally {
            gameEventManager.offPerformed(GameEventType.SacrificePermanent, afterLand);
            gameEventManager.offPerformed(GameEventType.DiscardCard, afterDiscard);
        }
    });

    test("skips prompts for tied and forced selections", () => {
        caster.manaPool[ManaColour.W] = 2;
        const land = addCard("Plains", caster, caster.battlefield);
        const opponentLand = addCard("Forest", opponent, opponent.battlefield);
        const opponentCard = addCard("Wall of Swords", opponent, opponent.hand);
        const opponentCreature = addCard("Grizzly Bears", opponent, opponent.battlefield);
        const onChoice = vi.fn();
        gameEventManager.onPerformed(GameEventType.RequestResolutionChoice, onChoice);
        try {
            cast();
            expect(onChoice).not.toHaveBeenCalled();
            expect(caster.battlefield.objects).toEqual([land]);
            expect(opponent.battlefield.objects).toEqual([opponentLand]);
            expect(opponent.hand.objects).toHaveLength(0);
            expect(opponent.graveyard.objects.map(card => card.card)).toEqual([opponentCard.card, opponentCreature.card]);
            expect(caster.graveyard.objects.map(card => card.card)).toEqual([balance.card]);
        } finally {
            gameEventManager.offPerformed(GameEventType.RequestResolutionChoice, onChoice);
        }
    });
});

describe("Blaze of Glory", () => {
    let attacker: Player;
    let defender: Player;

    function addCard<T extends CardObject>(name: string, owner: Player, zone: Zone<T>) {
        return addTestCard(cardData.find(card => card.name === name), owner, zone);
    }

    function declareAttackers(creatures: readonly Permanent[]) {
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
        for (const creature of creatures)
            new PlayerActions.DeclareAttacker(creature).perform(attacker);
        gameEventManager.addEvent(new GameEvent_Advance());
    }

    beforeEach(() => {
        Game.init();
        attacker = game.addPlayer([]);
        defender = game.addPlayer([]);
        startMainPhase();
    });

    test("the defender can cast after attackers are declared and must block each legal attacker", () => {
        const blaze = addCard("Blaze of Glory", defender, defender.hand);
        const plains = addCard("Plains", defender, defender.battlefield);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        blocker.toughness = 6;
        const bystander = addCard("Grizzly Bears", defender, defender.battlefield);
        const first = addCard("Mons's Goblin Raiders", attacker, attacker.battlefield);
        const second = addCard("Mons's Goblin Raiders", attacker, attacker.battlefield);
        const flyer = addCard("Air Elemental", attacker, attacker.battlefield);
        declareAttackers([first, second, flyer]);

        expect(game.currentStepIndex).toBe(StepIndex.DeclareAttackers);
        expect([first.tapped, second.tapped, flyer.tapped]).toEqual([true, true, true]);
        gameEventManager.addEvent(new GameEvent_Advance(attacker));
        expect(game.priorityPlayer).toBe(defender);
        new PlayerActions.PlayCard(blaze).perform(defender);
        game.pendingTargeter.onTargeted([blocker]);
        expect(plains.tapped).toBe(true);
        expect(game.stack.objects).toMatchObject([{ card: blaze.card, targets: [blocker] }]);
        expect(CombatManager.blockLimit(blocker)).toBe(1);
        passPriorityRound();
        expect(CombatManager.blockLimit(blocker)).toBe(Infinity);
        expect(CombatManager.blockLimit(bystander)).toBe(1);
        passPriorityRound();

        expect(game.declarationPlayer).toBe(defender);
        const block = new PlayerActions.DeclareBlocker(blocker);
        block.perform(defender, [first]);
        block.perform(defender, [flyer]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        expect(game.declarationPlayer).toBe(defender);
        expect(CombatManager.blockingCreatures.get(blocker)).toEqual(new Set([first]));

        block.perform(defender, [second]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        expect(game.priorityPlayer).toBe(attacker);
        expect([...CombatManager.blockRelationships()]).toEqual([[blocker, first], [blocker, second]]);
        passPriorityRound();
        expect(game.pendingCombatDamageChoice).toMatchObject({ player: defender, source: blocker, recipients: [first, second], total: 2 });
        game.pendingCombatDamageChoice.submit(defender, [1, 1]);
        expect(blocker.damageTaken).toBe(2);
        expect(attacker.graveyard.objects.map(object => object.card)).toEqual([first.card, second.card]);

        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.End));
        expect(CombatManager.blockLimit(blocker)).toBe(Infinity);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        expect(CombatManager.blockLimit(blocker)).toBe(1);
        expect(blocker.abilities).toHaveLength(0);
    });

    test("can target a tapped defending creature before attacks but only during the casting window", () => {
        const blaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const lateBlaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const first = addCard("Mons's Goblin Raiders", attacker, attacker.battlefield);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        const land = addCard("Plains", defender, defender.battlefield);
        blocker.tapped = true;
        game.infiniteMana = true;
        expect(playerActionManager.getCardActions(blaze, attacker)).toEqual([]);
        gameEventManager.addEvent(new GameEvent_CastSpell(attacker, blaze, [blocker]));
        expect(blaze.zone).toBe(attacker.hand);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.BeginningOfCombat));

        new PlayerActions.PlayCard(blaze).perform(attacker);
        const request = game.pendingTargeter;
        request.onTargeted([first]);
        request.onTargeted([land]);
        expect(game.pendingTargeter).toBe(request);
        request.onTargeted([blocker]);
        passPriorityRound();
        expect(CombatManager.blockLimit(blocker)).toBe(Infinity);

        declareAttackers([first]);
        passPriorityRound();
        expect(CombatManager.potentialBlockTargetsFor(blocker)).toEqual([]);
        gameEventManager.addEvent(new GameEvent_Advance(defender));
        expect(game.priorityPlayer).toBe(attacker);
        expect(game.currentStepIndex).toBe(StepIndex.DeclareBlockers);
        expect(playerActionManager.getCardActions(lateBlaze, attacker)).toEqual([]);
    });

    test("loses its target if the creature leaves and returns before resolution", () => {
        const blaze = addCard("Blaze of Glory", attacker, attacker.hand);
        const blocker = addCard("Grizzly Bears", defender, defender.battlefield);
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.BeginningOfCombat));
        gameEventManager.addEvent(new GameEvent_CastSpell(attacker, blaze, [blocker]));
        const returned = moveTestCard(moveTestCard(blocker, defender.graveyard), defender.battlefield);

        passPriorityRound();
        expect(CombatManager.blockLimit(returned)).toBe(1);
        expect(returned.abilities).toHaveLength(0);
        expect(attacker.graveyard.objects.map(object => object.card)).toEqual([blaze.card]);
    });
});

describe("Blessing", () => {
    const blessingDef = cardData.find(card => card.name === "Blessing");
    const plainsDef = cardData.find(card => card.name === "Plains");
    let caster: Player;
    let opponent: Player;
    let creature: Permanent;
    let blessing: CardObject;

    beforeEach(() => {
        Game.init();
        caster = game.addPlayer(BASIC_DECK);
        opponent = game.addPlayer(BASIC_DECK);
        startMainPhase();
        creature = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
        blessing = addTestCard(blessingDef, caster, caster.hand);
    });

    function castBlessing() {
        const [action] = playerActionManager.getCardActions(blessing, caster);
        action.perform(caster);
        game.pendingTargeter.onTargeted([creature]);
        passPriorityRound();
        const aura = caster.battlefield.objects.find(object => object.card === blessing.card);
        expect(aura?.attachedTo).toBe(creature);
        return aura;
    }

    function activate(aura: Permanent) {
        const [action] = playerActionManager.getCardActions(aura, caster);
        expect(action).toBeInstanceOf(PlayerActions.ActivateAbility);
        action.perform(caster);
    }

    test("casts for two white mana and stacks repeatable pumps paid by the Aura's controller", () => {
        const firstPlains = addTestCard(plainsDef, caster, caster.battlefield);
        expect(playerActionManager.getCardActions(blessing, caster)).toHaveLength(0);
        const secondPlains = addTestCard(plainsDef, caster, caster.battlefield);
        const aura = castBlessing();
        expect([firstPlains.tapped, secondPlains.tapped]).toEqual([true, true]);
        expect(creature).toMatchObject({ power: 2, toughness: 2 });
        expect(playerActionManager.getCardActions(aura, caster)).toHaveLength(0);

        caster.manaPool[ManaColour.W] = 1;
        const thirdPlains = addTestCard(plainsDef, caster, caster.battlefield);
        activate(aura);
        expect(thirdPlains.tapped).toBe(false);
        activate(aura);
        expect(thirdPlains.tapped).toBe(true);
        expect(caster.manaPool[ManaColour.W]).toBe(0);
        expect(game.stack.objects).toHaveLength(2);
        expect(game.pendingTargeter).toBeNull();
        expect(creature).toMatchObject({ power: 2, toughness: 2 });

        gameEventManager.addEvent(new GameEvent_Advance());
        opponent.manaPool[ManaColour.W] = 1;
        expect(playerActionManager.getCardActions(aura, opponent)).toHaveLength(0);
        expect(playerActionManager.getCardActions(creature, opponent)).toHaveLength(0);
        gameEventManager.addEvent(new GameEvent_Advance());
        expect(creature).toMatchObject({ power: 3, toughness: 3 });
        passPriorityRound();
        expect(creature).toMatchObject({ power: 4, toughness: 4 });

        gameEventManager.addEvent(new GameEvent_DealDamage(creature, creature, 3));
        expect(creature).toMatchObject({ damageTaken: 3, zone: opponent.battlefield });
        gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.Cleanup));
        expect(creature).toMatchObject({ power: 2, toughness: 2, damageTaken: 0, zone: opponent.battlefield });
    });

    test("each resolution pumps the creature attached at that time", () => {
        caster.manaPool[ManaColour.W] = 4;
        const aura = castBlessing();
        const other = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);

        activate(aura);
        passPriorityRound();
        activate(aura);
        gameEventManager.addEvent(new GameEvent_AttachPermanent(aura, other));
        passPriorityRound();

        expect(aura.attachedTo).toBe(other);
        expect(creature).toMatchObject({ power: 3, toughness: 3 });
        expect(other).toMatchObject({ power: 3, toughness: 3 });
    });

    test("an activation still pumps the last enchanted creature if Blessing leaves first", () => {
        caster.manaPool[ManaColour.W] = 3;
        const aura = castBlessing();
        activate(aura);
        moveTestCard(aura, caster.graveyard);
        passPriorityRound();

        expect(creature).toMatchObject({ power: 3, toughness: 3 });
    });

    test("a pending activation does not pump a creature that left and returned", () => {
        caster.manaPool[ManaColour.W] = 3;
        const aura = castBlessing();
        activate(aura);
        const returned = moveTestCard(moveTestCard(creature, opponent.hand), opponent.battlefield);
        passPriorityRound();

        expect(returned).toMatchObject({ power: 2, toughness: 2 });
        expect(aura.retired).toBe(true);
    });
});
