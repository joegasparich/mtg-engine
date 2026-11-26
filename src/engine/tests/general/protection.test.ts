import { PlayerActions } from "@engine/actions";
import { TargetTypeKeys } from "@engine/actions/PlayerActionManager";
import { CombatManager } from "@engine/CombatManager";
import { GameEvent_ChangeCardZone,GameEvent_DealDamage,GameEvent_GoToNextStep,GameEvent_GoToStep } from "@engine/events";
import gameEventManager,{ GameEventType } from "@engine/events/GameEventManager";
import Game,{ game } from "@engine/Game";
import { Permanent,Spell } from "@engine/GameObject";
import type Player from "@engine/Player";
import { StepIndex } from "@engine/Step";
import { addTestCard,GRIZZLY_BEARS } from "@engine/tests/testData";
import { ZoneKind } from "@engine/Zone";
import { AttachmentSubtype,type CardDef,CardType,Keyword } from "~/defs";
import { cardData } from "~/index";

let player: Player;
let opponent: Player;

const creature = cardData[GRIZZLY_BEARS];
const protection = { parts: { AbilityPart_Protection: { colour: "B" } } };
const enchantCreature = { parts: { SimpleAura: { targetValidator: { cardType: CardType.Creature } } } };
const destroyChosen = { inSignal: "SPELL_RESOLVE", permanentsFrom: "CHOSEN" };

beforeEach(() => {
    Game.init();
    player = game.addPlayer([]);
    opponent = game.addPlayer([]);
});

function addCreature(owner: Player, overrides: Partial<CardDef> = {}) {
    return addTestCard({ ...creature, ...overrides }, owner, owner.battlefield);
}

test("black spells cannot choose protected targets and targets are rechecked on resolution", () => {
    const target = addCreature(opponent, { abilities: [protection] });
    const removal: CardDef = {
        ...creature,
        name: "Test targeted destruction",
        type: CardType.Sorcery,
        abilities: [{ parts: {
            AbilityPart_Target: {
                saveAs: "CHOSEN", validTargets: [TargetTypeKeys.Card],
                targetValidator: { cardType: CardType.Creature, onBattlefield: true },
            },
            AbilityPart_Effect_DestroyPermanents: destroyChosen,
        } }],
    };
    const blackSpell = addTestCard({ ...removal, cost: "{W}{B}" }, player, player.hand);
    expect(blackSpell.spellTargeter.hasLegalTargets()).toBe(false);
    expect(game.stack.spellCast(player, blackSpell, [target])).toBe(false);

    const whiteSpell = addTestCard({ ...removal, cost: "{W}" }, player, player.hand);
    expect(whiteSpell.spellTargeter.hasLegalTargets()).toBe(true);
    expect(game.stack.spellCast(player, whiteSpell, [target])).toBe(true);
    const spell = game.stack.objects[0] as Spell;
    spell.colours = new Set(["W", "B"]);
    game.stack.resolveAll();

    expect(target.zone).toBe(opponent.battlefield);
    expect(player.graveyard.objects.map(object => object.card)).toEqual([whiteSpell.card]);
});

test("a black spell that destroys creatures without targeting still affects a protected creature", () => {
    const target = addCreature(opponent, { abilities: [protection] });
    const spell = addTestCard({
        ...creature,
        type: CardType.Sorcery,
        cost: "{B}",
        abilities: [{ parts: {
            AbilityPart_SelectObjectsFromZone: {
                inSignal: "SPELL_RESOLVE", saveAs: "CHOSEN", zone: ZoneKind.Battlefield,
                targetValidator: { cardType: CardType.Creature },
            },
            AbilityPart_Effect_DestroyPermanents: destroyChosen,
        } }],
    }, player, player.hand);

    expect(game.stack.spellCast(player, spell)).toBe(true);
    game.stack.resolveAll();
    expect(opponent.graveyard.objects.map(object => object.card)).toEqual([target.card]);
});

test("protection removes matching Auras and prevents new ones", () => {
    const target = addCreature(player);
    const aura: CardDef = { ...creature, type: CardType.Enchantment, subtypes: [AttachmentSubtype.Aura], cost: "{B}", abilities: [enchantCreature] };
    const blackAura = addTestCard(aura, opponent, opponent.hand);
    const whiteAura = addTestCard({ ...aura, cost: "{W}" }, opponent, opponent.hand);
    expect(game.stack.spellCast(opponent, blackAura, [target])).toBe(true);
    expect(game.stack.spellCast(opponent, whiteAura, [target])).toBe(true);
    game.stack.resolveAll();
    expect(opponent.battlefield.objects.find(object => object.card === blackAura.card)?.attachedTo).toBe(target);
    const attachedWhiteAura = opponent.battlefield.objects.find(object => object.card === whiteAura.card);
    expect(attachedWhiteAura?.attachedTo).toBe(target);

    const protectionAura = addTestCard({
        ...aura, cost: "{W}", abilities: [enchantCreature, { parts: {
            AbilityPart_SelectObjectContinuously: { target: "THIS.attachedTo", saveAs: "ENCHANTED_CREATURE" },
            AbilityPart_GrantAbilityContinuously: { permanentsFrom: "ENCHANTED_CREATURE", grant: protection },
        } }],
    }, player, player.hand);
    expect(game.stack.spellCast(player, protectionAura, [target])).toBe(true);
    game.stack.resolveAll();

    expect(opponent.graveyard.objects.map(object => object.card)).toEqual([blackAura.card]);
    expect(attachedWhiteAura.attachedTo).toBe(target);

    const newAura = addTestCard(aura, opponent, opponent.hand);
    expect(game.stack.spellCast(opponent, newAura, [target])).toBe(false);
    gameEventManager.addEvent(new GameEvent_ChangeCardZone(newAura, opponent.battlefield, { attachedTo: target }));
    expect(newAura.zone).toBe(opponent.hand);
    expect(opponent.battlefield.objects).toEqual([attachedWhiteAura]);
});

test("starting a new game ends a continuous grant and the effect it supplied", () => {
    const recipient = addCreature(player);
    const source = addCreature(opponent, { cost: "{B}" });
    const ward = addTestCard(cardData.find(card => card.name === "Black Ward"), player, player.hand);
    expect(game.stack.spellCast(player, ward, [recipient])).toBe(true);
    game.stack.resolveAll();

    expect(recipient.abilities).toHaveLength(1);
    expect(gameEventManager.checkEvent(new GameEvent_DealDamage(source, recipient, 1))).toBe(false);

    Game.init();

    expect(recipient.abilities).toHaveLength(0);
    expect(gameEventManager.checkEvent(new GameEvent_DealDamage(source, recipient, 1))).toBe(true);
});

test("black creatures cannot declare a block on a protected attacker but can block its bandmate", () => {
    const protectedAttacker = addCreature(player, { abilities: [protection] });
    const bandmate = addCreature(player, { abilities: [{ keyword: Keyword.Banding, parts: {} }] });
    const black = addCreature(opponent, { cost: "{B}" });
    const multicoloured = addCreature(opponent, { cost: "{B}{G}" });
    const green = addCreature(opponent);

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(protectedAttacker).perform(player);
    new PlayerActions.DeclareAttacker(bandmate).perform(player);
    expect(CombatManager.setAttackingBands(player, [[protectedAttacker, bandmate]])).toBe(true);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(CombatManager.potentialBlockTargetsFor(black)).toEqual([bandmate]);
    expect(CombatManager.potentialBlockTargetsFor(multicoloured)).toEqual([bandmate]);
    expect(CombatManager.potentialBlockTargetsFor(green)).toContain(protectedAttacker);
    new PlayerActions.DeclareBlocker(black).perform(opponent, [protectedAttacker]);
    expect(CombatManager.blockingCreatures.has(black)).toBe(false);
    new PlayerActions.DeclareBlocker(black).perform(opponent, [bandmate]);
    CombatManager.confirmBlocks();

    expect([...CombatManager.blockRelationships()]).toContainEqual([black, protectedAttacker]);
});

test("combat damage keeps each source and marks unprevented damage simultaneously", () => {
    const black = addCreature(player, { cost: "{B}{G}", abilities: [{ keyword: Keyword.Banding, parts: {} }] });
    const green = addCreature(player);
    const blocker = addCreature(opponent, { toughness: 3, abilities: [protection] });

    game.startGame();
    gameEventManager.addEvent(new GameEvent_GoToStep(StepIndex.DeclareAttackers));
    new PlayerActions.DeclareAttacker(black).perform(player);
    new PlayerActions.DeclareAttacker(green).perform(player);
    expect(CombatManager.setAttackingBands(player, [[black, green]])).toBe(true);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());
    new PlayerActions.DeclareBlocker(blocker).perform(opponent, [black]);
    gameEventManager.addEvent(new GameEvent_GoToNextStep());

    expect(blocker.damageTaken).toBe(0);
    const snapshots: [Permanent, number, number][] = [];
    const observeDamage = (event: GameEvent_DealDamage) => {
        snapshots.push([event.source as Permanent, blocker.damageTaken, green.damageTaken]);
    };
    gameEventManager.onPerformed(GameEventType.DealDamage, observeDamage);
    try {
        const choice = game.pendingCombatDamageChoice;
        choice.submit(player, choice.recipients.map(recipient => recipient === green ? 2 : 0));
    } finally {
        gameEventManager.offPerformed(GameEventType.DealDamage, observeDamage);
    }

    expect(snapshots).toEqual([[green, 2, 2], [blocker, 2, 2]]);
    expect(blocker.zone).toBe(opponent.battlefield);
    expect(black.zone).toBe(player.battlefield);
    expect(player.graveyard.objects.map(object => object.card)).toEqual([green.card]);
});
