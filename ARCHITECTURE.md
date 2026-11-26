# MTG Engine architecture

The TypeScript engine owns the game state and enforces the rules. The PixiJS frontend renders that state and collects player input. Card definitions configure reusable ability parts that supply card-specific behavior.

## Actions, abilities, effects, and events

| Concept | What it does | Example |
| --- | --- | --- |
| **Player action** | Handles a player's intent and validates whether they can act. | `PlayerAction_PlayCard` asks for any required targets, pays mana, and submits a cast event. |
| **Ability** | Defines what a spell or permanent can do, when it does it, and which parts implement it. | A basic land has an activation part for the tap cost and an effect part for adding mana. |
| **Effect** | Carries out a resolving instruction or applies an ongoing grant, restriction, or exception. | Armageddon produces a batch of destruction events. Black Ward grants an ability while attached. |
| **Game event** | Represents a proposed operation, a legality check, or a notification. Successful operations publish what happened. | `GameEvent_ChangeCardZone` moves a card. `GameEvent_CheckTarget` checks a proposed target. `GameEvent_StepStart` announces a step. |

When a player casts Ancestral Recall, the play action submits a cast event to put the spell on the stack. Once all players pass priority in succession, the spell resolves and its effect submits a draw instruction. An untap, a turn-based draw, and paying a tap cost enter the event manager directly as rules operations. Combat declaration actions edit the pending attack and block assignments through the combat system. [Play action](src/engine/actions/PlayerAction_PlayCard.ts) · [Event manager](src/engine/events/GameEventManager.ts)

## How abilities work

- **Definitions and instances.** `CardDef` and `AbilityDef` describe cards and abilities. `makeAbility` instantiates registered parts from their JSON configuration. Keyword definitions supply shared parts, and `SimpleAura` expands into targeting, attachment, and Aura resolution parts. [Definitions](src/defs.ts) · [Ability factory](src/engine/abilities/index.ts) · [Keyword abilities](keyword_abilities.json)
- **Parts, signals, and slate.** Each part handles a task such as validating a target, paying an activation cost, listening for a trigger, or producing an effect. Parts communicate through named signals and the ability's `slate`, which stores values such as `THIS` and selected objects. For example, Armageddon selects lands into the slate and signals the destruction part to use them. [Ability](src/engine/abilities/Ability.ts) · [Alpha card definitions](cards_lea.json)
- **Timing.** Resolving spells fire `SPELL_RESOLVE`. Activated abilities pay their costs before going on the stack, and mana abilities resolve immediately. Triggered abilities listen to performed events, capture their inputs, and wait to go on the stack. Static parts register continuous effects while their source is in the applicable zone. [Stack](src/engine/Stack.ts) · [Activation event](src/engine/events/GameEvent_ActivateAbility.ts) · [Trigger parts](src/engine/abilities/parts/trigger) · [Continuous effect part](src/engine/abilities/parts/AbilityPart_ContinuousEffect.ts)
- **Special actions.** Guardian Angel gives its controller a permission stored on `Game` until cleanup. The permission holds an ability instance with the original recipient in its slate. Taking the action at priority checks and pays its cost through the activation part, then fires the effect immediately under rule 116. [Game](src/engine/Game.ts) · [Guardian Angel](src/engine/abilities/parts/bespoke/AbilityPart_Effect_GuardianAngel.ts)

## How effects run

**One-shot effects** carry the originating ability into the events they produce. `emit` queues an event, `performImmediate` applies it inline, and `performSimultaneous` applies the whole batch before notifying listeners. Ancestral Recall queues a draw instruction and each individual draw reads the current top card. Armageddon destroys all affected lands in one batch. See rules 609.1, 610.1, 121.2, and 608.2f. [Effects system](src/engine/effects/EffectSystem.ts) · [Draw events](src/engine/events/GameEvent_DrawCard.ts)

**Continuous effects** can come from a static ability or from a resolving spell or ability. Black Ward's grant follows reattachment and ends when the Aura leaves or loses the granting ability. Blaze of Glory's ability part registers its grant for removal during cleanup. See rules 611.2–3 and 514.2. [Continuous effect part](src/engine/abilities/parts/AbilityPart_ContinuousEffect.ts) · [Temporary grants](src/engine/abilities/parts/effect/AbilityPart_Effect_GrantAbilityUntilEndOfTurn.ts)

### Continuous effect kinds

`ContinuousEffectKind` tells the engine how to apply a continuous effect. [Effect kinds](src/engine/effects/EffectSystem.ts)

| Kind | What it does |
| --- | --- |
| `EventCheck` | Registers a `check` callback. It can veto an event with `removeWhere`, substitute one with `replace`, or add one with `add`. A check can also update event data. Banding changes who assigns combat damage by setting the player on the damage assignment check. [Banding](src/engine/abilities/parts/AbilityPart_Banding.ts) |
| `CheckOverride` | Registers an `allow(event, source)` callback that can preserve an event when a check tries to remove or replace it. `CheckSource` identifies the object and can also carry its keyword and exact ability instance. |
| `AbilityGrant` | Grants an ability to a fixed list or a live selection of permanents. Each recipient keeps its ability instance while it qualifies. A continuous grant part can save those instances to its slate for another part to read. [Ability grants](src/engine/effects/EffectSystem.ts) |
| `ModifyPowerToughness` | Adds power and toughness whenever those stats are read. It uses the same `recipients` input as `AbilityGrant`. [Power and toughness](src/engine/effects/EffectSystem.ts) |
| `DamageEffect` | Registers a damage prevention or redirection rule. The affected player or permanent's controller chooses the order of competing rules and allocates limited effects among simultaneous sources. [Damage resolver](src/engine/effects/DamagePrevention.ts) |

### Event check phases

| Phase | When it runs | What it is used for |
| --- | --- | --- |
| `Proposal` | When events are submitted for execution or checked through `checkEvent()`. | Applies ordinary checks, such as defender restrictions and target legality. |
| `PreviewCommit` | In `checkEvent()` after the proposal survives. Runs checks registered with `beforeCommit: true` and sets `check.committing` to `false`. | Predicts whether an event would go through with the current game state. A damage preview can report prevention while leaving a shield available. |
| `Commit` | Immediately before each event is performed. Runs the same `beforeCommit` checks and sets `check.committing` to `true`. | Applies checks that depend on execution order or spend an effect, such as regeneration. |

The UI gets available actions and validates targets through engine methods. Attack, block, and target legality checks call `checkEvent()` and are handled by `Proposal` today. For damage, `checkEvent()` also previews prevention. When damage commits, the prevention system reduces the pending damage and spends shields under rules 615.7–8. [Player actions](src/engine/actions/PlayerActionManager.ts) · [Target checks](src/engine/abilities/parts/AbilityPart_Target.ts) · [Event manager](src/engine/events/GameEventManager.ts) · [Damage prevention tests](src/engine/tests/general/damagePrevention.test.ts)

### How cards intercept and override events

1. When a Wall is proposed as an attacker, `CombatManager.canAttack` checks its controller, zone, type, and tapped status, then checks a `GameEvent_DeclareAttacker`. [Combat manager](src/engine/CombatManager.ts)
2. The Wall's defender ability tries to remove that event. A removed declaration fails the legality check. See rule 702.3b. [Defender](src/engine/abilities/parts/AbilityPart_Defender.ts)
3. Animate Wall allows the event to survive that veto when the source of the check is defender on the creature it currently enchants. The exception applies only to that attack declaration and that restriction under rule 609.4. [Animate Wall override](src/engine/abilities/parts/AbilityPart_AttachedCreatureAttacksWithDefender.ts) · [Comprehensive Rules](ref/MagicCompRules.txt)

Black Ward's attachment override reads the protection grant from the slate and exempts the Ward's current attachment from that instance. A separate instance of protection can still make the Aura fall off. See rule 702.16n. [Ward attachment override](src/engine/abilities/parts/AbilityPart_KeepGrantingAuraAttached.ts)

## How the event queue works

`addEvent` and `addEvents` append to the pending queue and run `Proposal` checks on it. If the event loop is idle, it starts draining immediately. The loop takes the pending events as a batch and runs them in order. Events queued during that batch wait for the next pass. When an event succeeds, the manager calls its `onPerformed` listeners and then its `then` callback. [Event manager](src/engine/events/GameEventManager.ts)

Use `onGamePerformed(type, callback, options)` for subscriptions owned by the current game. It returns a function that cancels the subscription. Use `matches` to filter events, and set `once` to detach the callback on its first match. Starting a new game drops these subscriptions. A subscription created during notification starts observing with the next event or simultaneous batch. [Event manager](src/engine/events/GameEventManager.ts)

For look-back triggers under rule 603.10a, `captureBeforeBatch` saves the listener's state before any event in the batch performs. A successful event delivers that state to the callback even if the source retired during the batch. The death trigger listens for `ChangeCardZone` and matches moves from the battlefield to a graveyard. [Zone changes](src/engine/events/GameEvent_ChangeCardZone.ts) · [Death trigger](src/engine/abilities/parts/trigger/AbilityPart_Trigger_Dies.ts)

Blaze of Glory uses a one-shot `Cleanup` subscription to revoke its grant alongside marked damage removal under rule 514.2. An ability that triggers on a later event uses its subscription to queue a stack object with `Stack.abilityTriggered`. Delayed triggers capture their source and controller when created under rule 603.7. When several events match simultaneously, rule 603.7b can require the controller to choose the event. [Stack](src/engine/Stack.ts) · [Comprehensive Rules](ref/MagicCompRules.txt)

The loop checks for work from top to bottom.

1. **Queued events.** Drain any new batch first, including choice submissions. While damage prevention choices are pending, process those choice events until the damage batch can commit. A pending resolution or combat damage choice pauses the loop once its queue is empty.
2. **`onResolved` follow-ups.** Run callbacks scheduled to follow queued events.
3. **`continueResolution` callbacks.** Advance the current spell or ability to its next instruction.
4. **Game state checks.** Finish any current stack resolution, perform applicable state-based actions until stable, and put waiting triggers on the stack. [Game state checks](src/engine/Game.ts)
5. **`onIdle` callbacks.** Start work that needs a settled game state, such as resolving the next object on the stack or advancing a step. [Stack](src/engine/Stack.ts) · [Turn progression](src/engine/Game.ts)
6. **Automatic progression.** Confirm an empty combat declaration or pass priority if the player has no available action other than mana abilities. The dev checkbox can pass even when actions are available. The turn player still confirms the end of the turn. [Turn progression](src/engine/Game.ts)

After each `onResolved`, `continueResolution`, or `onIdle` callback, the loop starts again at the top of the list. Balance schedules its next instruction with `continueResolution` so it counts cards after the previous instruction's moves and their queued follow-ups. [Balance effect](src/engine/abilities/parts/effect/AbilityPart_Effect_EqualizeCards.ts)

## Engine and frontend systems

| System | Responsibility |
| --- | --- |
| **Cards, objects, and zones** | `Card` holds a card's definition and owner across zone changes. `CardObject` is its current rules object, with `Spell` and `Permanent` as specialized forms. A zone change creates a new object under rule 400.7. Targets and attachments track the rules object. [Game objects](src/engine/GameObject.ts) · [Zones](src/engine/Zone.ts) |
| **Turns and priority** | `Game` owns the players, turn, current step, and priority. `Step` runs turn-based actions before granting priority. The turn player gets priority after declarations and after each resolution. See rule 117. [Game](src/engine/Game.ts) · [Steps](src/engine/Step.ts) |
| **Stack and choices** | The stack holds spells and separate occurrences of activated or triggered abilities. Consecutive passes resolve one stack object or end the step if the stack is empty. The stack rechecks spell targets at resolution. Choices pause processing until the acting player submits valid input. [Stack](src/engine/Stack.ts) · [Choices](src/engine/Game.ts) |
| **Mana** | `ManaUtility` parses mana costs and handles payment. `PlayerActionManager` checks available mana and can activate eligible mana abilities to pay for a spell. Mana pools empty at step boundaries. [Mana](src/engine/mana.ts) · [Actions and autopay](src/engine/actions/PlayerActionManager.ts) |
| **Combat** | `CombatManager` validates and tracks attackers, blockers, and bands. It gathers damage assignments, retains their sources for checks such as protection, and deals damage among combatants in one batch. [Combat manager](src/engine/CombatManager.ts) |
| **Browser UI** | `UIRoot` reacts to engine events and coordinates card views, targeting, and choice dialogs. `UICombat` renders declarations and gathers damage assignments. `UIEventManager` carries frontend interactions such as card clicks. [UI root](src/ui/UIRoot.ts) · [Combat UI](src/ui/UICombat.ts) · [UI events](src/ui/UIEventManager.ts) |
| **Card data and artwork** | The local JSON catalogs supply card mechanics. `UICard` loads artwork from each definition's `image_url`. The Scryfall service provides card and set metadata lookups. [Card catalog](src/index.ts) · [Card view](src/ui/UICard.ts) · [Scryfall service](src/scryfallService.ts) |
| **Build and tests** | Vite runs the browser app and production build. Vitest covers general engine behavior and individual cards. `npm run check` runs TypeScript, ESLint, and the test suite. [Engine tests](src/engine/tests) · [Package scripts](package.json) |
