- You can find the official rules under ref/MagicCompRules.txt
- Where appropriate, reference the magic rule number in a comment
- Please use enums instead of strings where applicable

# Implementing Cards
- We are implementing Limited Edition Alpha cards, but use artwork from the 30th anniversary set since the text is accurate https://scryfall.com/sets/30a
- Implement the smallest possible feature set for each card, but do so in a way that prepares for future game rules/systems
- After each new card(s) implementation, recreate the deck for each player to facilitate testing that card(s)

## Follow existing patterns
Request permission when modifying the engines or doing something that does not follow one of these rules.
- Implement card mechanics using abilities rather than modifying the engine. Add hooks as needed.
- Prefer implement behaviour by interacting with the gameEventManager
- Prefer not adding new ContinuousEffectKinds, unless absolutely necesarry. 
- If the card has a very unique effect, it's okay to "script" the card with a single bespoke ability part that just handles everything.
- Each ability part should be completely decoupled from other ability parts. They should be atomic and reusable
- Ability parts can read, store, and modify values to the slate. This allows communication between configured parts.

# Tests
- Add general tests as well as tests for each card under it's set unless that card is just a straightforward creature with Power/Toughness and simple keywords.