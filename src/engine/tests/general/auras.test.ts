import { makeAbility } from "@engine/abilities";
import { CardObject,Permanent } from "@engine/GameObject";
import { GameEvent_ChangeCardZone } from "@engine/events";
import { GameEvent_CheckAttachment } from "@engine/events/GameEvent_CardInteractionChecks";
import gameEventManager,{ type EventCheck,GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type Player from "@engine/Player";
import { addTestCard,FOREST,GRIZZLY_BEARS,moveTestCard } from "@engine/tests/testData";
import { AttachmentSubtype,CardType } from "~/defs";
import { cardData } from "~/index";

let caster: Player;
let opponent: Player;
let aura: CardObject;
let target: Permanent;

beforeEach(() => {
    Game.init();
    caster = game.addPlayer([]);
    opponent = game.addPlayer([]);
    aura = addTestCard({
        name: "Test Aura",
        image_url: "",
        oracle_text: "Enchant creature",
        types: [CardType.Enchantment],
        subtypes: [AttachmentSubtype.Aura],
        cost: "{W}",
        power: undefined,
        toughness: undefined,
        abilities: [{
            parts: {
                AbilityPart_AuraTarget: { saveAs: "ENCHANTED", targetValidator: { cardType: CardType.Creature } },
                AbilityPart_Aura: { attachmentFrom: "ATTACHMENT" },
                AbilityPart_Attach: { inSignal: "SPELL_RESOLVE", target: "ENCHANTED", saveAs: "ATTACHMENT", cardType: CardType.Creature },
            },
        }],
    }, caster, caster.hand);
    target = addTestCard(cardData[GRIZZLY_BEARS], opponent, opponent.battlefield);
});

test("an Aura enters attached under its caster's control and follows state-based cleanup", () => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    game.stack.resolveAll();

    const attached = caster.battlefield.objects.find(object => object.card === aura.card);
    expect(attached?.attachedTo).toBe(target);
    expect(attached?.controller).toBe(caster);
    expect(target.controller).toBe(opponent);

    const graveyardObject = moveTestCard(target, opponent.graveyard);
    const returned = moveTestCard(graveyardObject, opponent.battlefield);
    expect(returned).not.toBe(target);
    expect(returned.card).toBe(target.card);
    expect(attached.attachedTo).toBeUndefined();
    expect(caster.graveyard.objects.map(object => object.card)).toContain(aura.card);
});

test("an Aura's changed colour applies during attachment checks on entry", () => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    const [spell] = game.stack.objects;
    const recolour = makeAbility({ parts: { AbilityPart_Effect_SetColour: { target: "RECIPIENT", colour: "G" } } }, aura);
    recolour.slate.RECIPIENT = [spell];
    recolour.fireSignal("default");
    target.grantAbility({ parts: { AbilityPart_Protection: { colour: "W" } } }, target);

    game.stack.resolveAll();

    const attached = caster.battlefield.objects.find(object => object.card === aura.card);
    expect(attached).toMatchObject({ attachedTo: target, colours: new Set(["G"]) });
});

test.each(["leaves", "leaves and returns", "stops being a creature"])("an Aura fails to resolve if the target %s", change => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    if (change === "stops being a creature") {
        target.types = [CardType.Land];
    } else {
        const handObject = moveTestCard(target, opponent.hand);
        if (change === "leaves and returns")
            moveTestCard(handObject, opponent.battlefield);
    }

    game.stack.resolveAll();

    expect(caster.graveyard.objects.map(object => object.card)).toContain(aura.card);
    expect(game.stack.objects).toHaveLength(0);
});

test("Aura spells check attachment restrictions during casting and again before resolving", () => {
    let canAttach = false;
    const restrictAttachment = (check: EventCheck) => {
        if (!canAttach)
            check.removeWhere(event => event instanceof GameEvent_CheckAttachment && event.recipient === target);
    };
    gameEventManager.onCheck(restrictAttachment);
    try {
        expect(aura.spellTargeter.hasLegalTargets()).toBe(false);
        expect(game.stack.spellCast(caster, aura, [target])).toBe(false);

        canAttach = true;
        expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
        const [spell] = game.stack.objects;
        expect(spell).toBeInstanceOf(CardObject);
        const resolve = vi.spyOn((spell as CardObject).abilities[0], "fireSignal");

        canAttach = false;
        game.stack.resolveAll();

        expect(resolve).not.toHaveBeenCalled();
        expect(caster.graveyard.objects.map(object => object.card)).toEqual([aura.card]);
    } finally {
        gameEventManager.offCheck(restrictAttachment);
    }
});

test("state checks put an Aura with an illegal attachment into its owner's graveyard", () => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    game.stack.resolveAll();

    target.types = [CardType.Land];
    game.checkState();

    expect(caster.graveyard.objects.map(object => object.card)).toContain(aura.card);
});

test("an Aura goes straight to its owner's graveyard if its attachment becomes illegal during entry", () => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    const [spell] = game.stack.objects;
    const beforeEntry = (check: EventCheck) => {
        if (check.events.some(event => event instanceof GameEvent_ChangeCardZone
            && event.oldObject === spell && event.newZone === caster.battlefield))
            target.types = [CardType.Land];
    };
    const moves = vi.fn();
    const onMove = (event: GameEvent_ChangeCardZone) => {
        if (event.oldObject === spell)
            moves(event.newZone);
    };
    gameEventManager.onCheck(beforeEntry);
    gameEventManager.onPerformed(GameEventType.ChangeCardZone, onMove);
    try {
        game.stack.resolveAll();
    } finally {
        gameEventManager.offCheck(beforeEntry);
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, onMove);
    }

    expect(moves.mock.calls).toEqual([[caster.graveyard]]);
    expect(game.stack.objects).toHaveLength(0);
});

test("an Aura waits for pending zone changes before it starts resolving", () => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    const moveThenResolve = new GameEvent_Log(GameEventType.Log, "Move the target and resolve");
    moveThenResolve.then(() => {
        gameEventManager.addEvent(new GameEvent_ChangeCardZone(target, opponent.hand));
        game.stack.resolveAll();
    });
    const auraMoves = vi.fn();
    const onMove = (event: GameEvent_ChangeCardZone) => {
        if (event.newObject.card === aura.card)
            auraMoves(event.newZone);
    };
    gameEventManager.onPerformed(GameEventType.ChangeCardZone, onMove);
    try {
        gameEventManager.addEvent(moveThenResolve);
        expect(auraMoves.mock.calls).toEqual([[caster.graveyard]]);
        } finally {
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, onMove);
    }
});

test("the next spell waits for events and follow-ups from the top spell", () => {
    const top = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.hand);
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    expect(game.stack.spellCast(caster, top)).toBe(true);

    const moves = vi.fn();
    const onMove = (event: GameEvent_ChangeCardZone) => {
        moves(event.newObject.card, event.newZone, event.newObject instanceof Permanent ? event.newObject.attachedTo : undefined);
        if (event.newObject.card === top.card && event.newZone === caster.battlefield) {
            const followUp = new GameEvent_Log(GameEventType.Log, "Queue the follow-up zone change");
            followUp.then(() => gameEventManager.onResolved(() => {
                gameEventManager.addEvent(new GameEvent_ChangeCardZone(target, opponent.hand));
            }));
            gameEventManager.addEvent(followUp);
        }
    };
    gameEventManager.onPerformed(GameEventType.ChangeCardZone, onMove);
    try {
        game.stack.resolveAll();
        expect(moves.mock.calls).toEqual([
            [top.card, caster.battlefield, undefined],
            [target.card, opponent.hand, undefined],
            [aura.card, caster.graveyard, undefined],
        ]);
        expect(game.stack.objects).toHaveLength(0);
    } finally {
        gameEventManager.offPerformed(GameEventType.ChangeCardZone, onMove);
    }
});

test("a non-Aura enchantment resolves and remains on the battlefield without an attachment", () => {
    const enchantment = addTestCard({
        ...aura.def,
        name: "Test Enchantment",
        subtypes: [],
        abilities: [],
    }, caster, caster.hand);
    expect(game.stack.spellCast(caster, enchantment)).toBe(true);
    game.stack.resolveAll();
    game.checkState();

    const permanent = caster.battlefield.objects.find(object => object.card === enchantment.card);
    expect(permanent).toBeInstanceOf(Permanent);
    expect(permanent.attachedTo).toBeUndefined();
});

test("an attachment effect can move an Aura to another legal recipient", () => {
    const movableAura = addTestCard({
        ...aura.def,
        abilities: [...aura.def.abilities, { parts: { AbilityPart_Attach: { target: "CHOSEN" } } }],
    }, caster, caster.hand);
    const land = addTestCard(cardData[FOREST], caster, caster.battlefield);
    const otherCreature = addTestCard(cardData[GRIZZLY_BEARS], caster, caster.battlefield);

    expect(game.stack.spellCast(caster, movableAura, [target])).toBe(true);
    game.stack.resolveAll();
    const attached = caster.battlefield.objects.find(object => object.card === movableAura.card);
    expect(attached?.attachedTo).toBe(target);

    const [, ability] = attached.abilities;
    ability.slate.CHOSEN = [land];
    ability.fireSignal("default");
    expect(attached.attachedTo).toBe(target);

    ability.slate.CHOSEN = [otherCreature];
    ability.fireSignal("default");
    expect(attached.attachedTo).toBe(otherCreature);
});
