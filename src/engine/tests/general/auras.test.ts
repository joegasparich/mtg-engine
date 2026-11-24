import { CardObject,Permanent } from "@engine/GameObject";
import { GameEvent_ChangeCardZone } from "@engine/events";
import gameEventManager,{ GameEvent_Log,GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import type Player from "@engine/Player";
import { addTestCard,moveTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { CardType } from "~/defs";
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
        type: CardType.Enchantment,
        subtypes: ["Aura"],
        cost: "{W}",
        power: undefined,
        toughness: undefined,
        abilities: [{
            parts: {
                AbilityPart_Target: { saveAs: "ENCHANTED", validTargets: ["Card"], onBattlefield: true, cardType: CardType.Creature },
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

test.each(["leaves", "leaves and returns", "stops being a creature"])("an Aura fails to resolve if the target %s", change => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    if (change === "stops being a creature") {
        target.type = CardType.Land;
    } else {
        const handObject = moveTestCard(target, opponent.hand);
        if (change === "leaves and returns")
            moveTestCard(handObject, opponent.battlefield);
    }

    game.stack.resolveAll();

    expect(caster.graveyard.objects.map(object => object.card)).toContain(aura.card);
    expect(game.stack.objects).toHaveLength(0);
});

test("state checks put an Aura with an illegal attachment into its owner's graveyard", () => {
    expect(game.stack.spellCast(caster, aura, [target])).toBe(true);
    game.stack.resolveAll();

    target.type = CardType.Land;
    game.checkState();

    expect(caster.graveyard.objects.map(object => object.card)).toContain(aura.card);
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

test("an attachment part can attach and detach an Equipment independently of Aura rules", () => {
    const equipment = addTestCard({
        ...aura.def,
        name: "Test Equipment",
        type: CardType.Artifact,
        subtypes: ["Equipment"],
        abilities: [{ parts: { AbilityPart_Attach: { target: "CHOSEN", targetValidator: { cardType: CardType.Creature } } } }],
    }, caster, caster.battlefield);
    const land = addTestCard(cardData[0], caster, caster.battlefield);

    const [ability] = equipment.abilities;
    ability.slate.CHOSEN = [land];
    ability.fireSignal("default");
    expect(equipment.attachedTo).toBeUndefined();

    ability.slate.CHOSEN = [target];
    ability.fireSignal("default");
    expect(equipment.attachedTo).toBe(target);

    target.type = CardType.Land;
    game.checkState();
    expect(equipment.attachedTo).toBeUndefined();
    expect(equipment.zone).toBe(caster.battlefield);
});
